package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/peaske7/readit/internal/server"
	"github.com/pkg/browser"
)

const version = "0.3.0"

type serverInfo struct {
	Port int `json:"port"`
	PID  int `json:"pid"`
}

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: readit <file.md> [flags]")
		fmt.Println("       readit list")
		fmt.Println("       readit show <file.md>")
		fmt.Println("       readit open <file.md>")
		os.Exit(1)
	}

	switch os.Args[1] {
	case "list":
		cmdList()
	case "show":
		cmdShow()
	case "open":
		cmdOpen()
	case "version", "--version", "-v":
		fmt.Println("readit", version)
	case "help", "--help", "-h":
		printHelp()
	default:
		cmdServe()
	}
}

func cmdServe() {
	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	port := fs.Int("port", 0, "port to listen on (default: random)")
	host := fs.String("host", "127.0.0.1", "host to bind to")
	noOpen := fs.Bool("no-open", false, "don't open browser")
	clean := fs.Bool("clean", false, "clear existing comments")
	assetsDir := fs.String("assets-dir", "", "serve assets from directory instead of embedded")
	dev := fs.Bool("dev", false, "development mode (proxy to Vite)")

	// Separate file args from flag args. Flags that take values
	// (--port 3000, --host 0.0.0.0, --assets-dir ./dist) consume the next arg.
	valueFlags := map[string]bool{
		"-port": true, "--port": true,
		"-host": true, "--host": true,
		"-assets-dir": true, "--assets-dir": true,
	}

	var fileArgs []string
	var flagArgs []string
	args := os.Args[1:]
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if strings.HasPrefix(arg, "-") {
			flagArgs = append(flagArgs, arg)
			// If this flag takes a value, consume the next arg too
			if valueFlags[arg] && i+1 < len(args) {
				i++
				flagArgs = append(flagArgs, args[i])
			}
		} else {
			fileArgs = append(fileArgs, arg)
		}
	}
	_ = fs.Parse(flagArgs)

	if len(fileArgs) == 0 {
		fmt.Fprintln(os.Stderr, "Error: at least one file is required")
		os.Exit(1)
	}

	files, err := resolveFiles(fileArgs)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	if *port == 0 {
		*port = 4567
	}

	// Dev mode: spawn Vite
	var viteCmd *exec.Cmd
	if *dev {
		viteCmd = spawnVite()
	}

	srv, err := server.NewServer(server.Options{
		Files:     files,
		Port:      *port,
		Host:      *host,
		Clean:     *clean,
		AssetsDir: *assetsDir,
		Dev:       *dev,
	})
	if err != nil {
		log.Fatal(err)
	}

	actualPort, err := srv.Start(*host, *port)
	if err != nil {
		log.Fatal(err)
	}

	writeServerInfo(actualPort)

	url := fmt.Sprintf("http://%s:%d", *host, actualPort)
	fmt.Printf("readit v%s serving at %s\n", version, url)

	if !*noOpen {
		_ = browser.OpenURL(url)
	}

	// Wait for interrupt
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	fmt.Println("\nShutting down...")
	srv.Stop()
	if viteCmd != nil && viteCmd.Process != nil {
		_ = viteCmd.Process.Kill()
	}
	removeServerInfo()
}

func cmdList() {
	home, _ := os.UserHomeDir()
	commentsDir := filepath.Join(home, ".readit", "comments")

	_ = filepath.Walk(commentsDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		if !strings.HasSuffix(path, ".comments.md") {
			return nil
		}

		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}

		cf, err := server.ParseCommentFile(data)
		if err != nil {
			return nil
		}

		fmt.Printf("%s (%d comments)\n", cf.Source, len(cf.Comments))
		return nil
	})
}

func cmdShow() {
	if len(os.Args) < 3 {
		fmt.Fprintln(os.Stderr, "Usage: readit show <file.md>")
		os.Exit(1)
	}

	filePath, err := filepath.Abs(os.Args[2])
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	commentPath := server.CommentPath(filePath)
	data, err := os.ReadFile(commentPath)
	if err != nil {
		fmt.Println("No comments found for", filePath)
		return
	}

	cf, err := server.ParseCommentFile(data)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	for i, c := range cf.Comments {
		text := c.SelectedText
		if len(text) > 80 {
			text = text[:80] + "…"
		}
		fmt.Printf("[%d] %s\n", i+1, c.LineHint)
		fmt.Printf("    > %s\n", strings.ReplaceAll(text, "\n", "\n    > "))
		fmt.Printf("    %s\n", c.Comment)
		fmt.Printf("    (%s)\n\n", c.CreatedAt)
	}
}

func cmdOpen() {
	if len(os.Args) < 3 {
		fmt.Fprintln(os.Stderr, "Usage: readit open <file.md>")
		os.Exit(1)
	}

	files, err := resolveFiles(os.Args[2:])
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	// Try to discover a running server
	info, err := discoverServer()
	if err == nil && info != nil {
		// Attach to existing server
		for _, f := range files {
			attachFile(info.Port, f.FilePath)
		}
		url := fmt.Sprintf("http://127.0.0.1:%d", info.Port)
		_ = browser.OpenURL(url)
		return
	}

	// No running server — start one
	os.Args = append([]string{os.Args[0]}, os.Args[2:]...)
	cmdServe()
}

func resolveFiles(args []string) ([]server.FileEntry, error) {
	seen := make(map[string]bool)
	var files []server.FileEntry

	for _, arg := range args {
		absPath, err := filepath.Abs(arg)
		if err != nil {
			return nil, fmt.Errorf("invalid path %s: %w", arg, err)
		}

		absPath, err = filepath.EvalSymlinks(absPath)
		if err != nil {
			return nil, fmt.Errorf("file not found: %s", arg)
		}

		info, err := os.Stat(absPath)
		if err != nil {
			return nil, fmt.Errorf("file not found: %s", arg)
		}

		if info.IsDir() {
			// Scan directory for markdown files
			_ = filepath.Walk(absPath, func(path string, fi os.FileInfo, err error) error {
				if err != nil || fi.IsDir() {
					if fi != nil && fi.IsDir() && strings.HasPrefix(fi.Name(), ".") {
						return filepath.SkipDir
					}
					if fi != nil && fi.IsDir() && fi.Name() == "node_modules" {
						return filepath.SkipDir
					}
					return nil
				}
				ext := strings.ToLower(filepath.Ext(path))
				if ext == ".md" || ext == ".markdown" {
					if !seen[path] {
						seen[path] = true
						files = append(files, server.FileEntry{FilePath: path})
					}
				}
				return nil
			})
		} else {
			ext := strings.ToLower(filepath.Ext(absPath))
			if ext != ".md" && ext != ".markdown" {
				return nil, fmt.Errorf("unsupported file type: %s (only .md and .markdown)", arg)
			}
			if !seen[absPath] {
				seen[absPath] = true
				files = append(files, server.FileEntry{FilePath: absPath})
			}
		}
	}

	if len(files) == 0 {
		return nil, fmt.Errorf("no markdown files found")
	}

	return files, nil
}

func serverInfoPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".readit", "server.json")
}

func writeServerInfo(port int) {
	info := serverInfo{Port: port, PID: os.Getpid()}
	data, _ := json.Marshal(info)
	path := serverInfoPath()
	_ = os.MkdirAll(filepath.Dir(path), 0755)
	_ = os.WriteFile(path, data, 0644)
}

func removeServerInfo() {
	_ = os.Remove(serverInfoPath())
}

func discoverServer() (*serverInfo, error) {
	data, err := os.ReadFile(serverInfoPath())
	if err != nil {
		return nil, err
	}

	var info serverInfo
	if err := json.Unmarshal(data, &info); err != nil {
		return nil, err
	}

	// Check if process is alive
	proc, err := os.FindProcess(info.PID)
	if err != nil {
		return nil, err
	}
	if err := proc.Signal(syscall.Signal(0)); err != nil {
		return nil, fmt.Errorf("process not alive")
	}

	// Health check
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/api/health", info.Port))
	if err != nil {
		return nil, err
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("health check failed")
	}

	return &info, nil
}

func attachFile(port int, filePath string) {
	body := fmt.Sprintf(`{"path":"%s"}`, filePath)
	resp, err := http.Post(
		fmt.Sprintf("http://127.0.0.1:%d/api/documents", port),
		"application/json",
		strings.NewReader(body),
	)
	if err != nil {
		log.Printf("Warning: failed to attach %s: %v", filePath, err)
		return
	}
	_ = resp.Body.Close()
}

func spawnVite() *exec.Cmd {
	cmd := exec.Command("bunx", "vite", "--port", "24678")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		log.Printf("Warning: failed to start Vite: %v", err)
		return nil
	}
	// Give Vite a moment to start
	time.Sleep(500 * time.Millisecond)
	return cmd
}

func printHelp() {
	fmt.Printf(`readit v%s — Review Markdown documents with inline comments

Usage:
  readit <file.md> [flags]     Start server and open browser
  readit list                  List files with comments
  readit show <file.md>        Show comments for a file
  readit open <file.md>        Add file to running server

Flags:
  --port <n>        Port to listen on (default: 4567)
  --host <addr>     Host to bind to (default: 127.0.0.1)
  --no-open         Don't auto-open browser
  --clean           Clear existing comments
  --assets-dir <d>  Serve assets from directory
  --dev             Development mode (spawn Vite)

`, version)
}
