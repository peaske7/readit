package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// The TypeScript CLI and the Go binary both read and write ~/.readit/server.json,
// so both test suites assert against this one fixture.
const fixturePath = "../../../src/lib/__fixtures__/server-info.json"

func readFixture(t *testing.T) []byte {
	t.Helper()
	data, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	return data
}

func TestServerInfoParsesFixture(t *testing.T) {
	var info serverInfo
	if err := json.Unmarshal(readFixture(t), &info); err != nil {
		t.Fatalf("unmarshal fixture: %v", err)
	}

	if info.Port != 4567 {
		t.Errorf("Port = %d, want 4567", info.Port)
	}
	if info.PID != 12345 {
		t.Errorf("PID = %d, want 12345", info.PID)
	}
	if info.Host != "127.0.0.1" {
		t.Errorf("Host = %q, want 127.0.0.1", info.Host)
	}
}

func TestWriteServerInfoMatchesFixtureShape(t *testing.T) {
	home := t.TempDir()
	t.Setenv("READIT_HOME", home)

	writeServerInfo(4567, "127.0.0.1")

	written, err := os.ReadFile(filepath.Join(home, "server.json"))
	if err != nil {
		t.Fatalf("read server.json: %v", err)
	}

	var got, want map[string]any
	if err := json.Unmarshal(written, &got); err != nil {
		t.Fatalf("unmarshal written: %v", err)
	}
	if err := json.Unmarshal(readFixture(t), &want); err != nil {
		t.Fatalf("unmarshal fixture: %v", err)
	}

	if len(got) != len(want) {
		t.Fatalf("keys = %v, want the fixture's keys %v", keys(got), keys(want))
	}
	for key := range want {
		if _, ok := got[key]; !ok {
			t.Errorf("written server.json is missing %q", key)
		}
	}
	if got["port"] != want["port"] {
		t.Errorf("port = %v, want %v", got["port"], want["port"])
	}
	if got["host"] != want["host"] {
		t.Errorf("host = %v, want %v", got["host"], want["host"])
	}
	if got["pid"] != float64(os.Getpid()) {
		t.Errorf("pid = %v, want %d", got["pid"], os.Getpid())
	}
}

func TestResolvedHost(t *testing.T) {
	cases := []struct {
		host string
		want string
	}{
		{"", "127.0.0.1"},
		{"0.0.0.0", "127.0.0.1"},
		{"::", "127.0.0.1"},
		{"192.168.1.5", "192.168.1.5"},
	}

	for _, tc := range cases {
		info := serverInfo{Host: tc.host}
		if got := info.resolvedHost(); got != tc.want {
			t.Errorf("resolvedHost(%q) = %q, want %q", tc.host, got, tc.want)
		}
	}
}

func keys(m map[string]any) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
