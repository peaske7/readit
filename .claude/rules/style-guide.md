# Style Guide

## 1 Introduction

Good software is fast, reliable, and beautiful.
Fast software requires focus and clarity.
Reliable software requires simplicity and correctness.
Beautiful software requires attention to detail and aesthetics.

### 1.1 Core Philosophy

- **Obvious over clever** - Code should be immediately understandable and easy to reason about. The wtf metric should be less than 1.
- **Code is a liability** - Less code means fewer bugs, easier maintenance, and faster comprehension. Also, well written code is usually shorter, since it's much more focused and concise.
- **Type safety without overhead** - Leverage TypeScript without runtime cost
- **Work with the language, not against it** - Prefer native JavaScript patterns over complex type gymnastics. My aversion to complex libraries like rxjs, effect-ts, functional-ts stems from the fact that force the writer a "non-native" way of thinking about the language.
- **Immutability by default** - Prevent bugs through data flow clarity
- **Composition over inheritance** - Build complex behavior from simple, reusable parts
- **Fail fast, recover explicitly** - Make error states visible and recoverable
- **Duplication over wrong abstraction** - Write it twice, abstract on the third time
- **Practicality over rigid rules** - Adapt patterns to the problem at hand
- **Tight, clean implementations** - Functions should do their job without ceremony or overhead

## 2 Type Design

### 2.1 Parse, Don't Validate

**Why:** Transform data into types that make invalid states impossible, but stay pragmatic with native JavaScript types.

```ts
// Good - parse into a stronger type, but keep it simple
function parseUserId(input: unknown): string {
  if (typeof input !== 'string' || !input.startsWith('user_')) {
    throw new Error('Invalid user ID format');
  }
  return input; // Now we know it's a valid user ID
}

// Good - use native JavaScript types
function parseDate(input: string): Date {
  const date = new Date(input);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid date');
  }
  return date;
}

// Bad - bespoke utility types that fight the language
type ParsedString<T extends string> = T extends `${infer P}` ? P : never;
type ValidatedNumber<Min extends number, Max extends number> = number & {
  __min: Min;
  __max: Max;
};

// Bad - validate repeatedly instead of parsing once
function processUser(userId: string) {
  if (!isValidUserId(userId)) throw new Error();
  // ... later in code
  if (!isValidUserId(userId)) throw new Error(); // Validating again!
}
```

### 2.2 Discriminated Unions Over Classes

**Why:** Exhaustive checking, no inheritance complexity, better tree-shaking.

```ts
// Good
type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: User[] }
  | { status: 'error'; error: Error };

// Bad - classes add unnecessary complexity
class IdleState {}
class LoadingState {}
class SuccessState { constructor(public data: User[]) {} }
```

Exception: use classes only for stateful services with multiple collaborators (dependency injection). Do not model state machines or data with classes. See 8.1.

### 2.3 Null vs Undefined Policy

- Prefer `undefined` for optionals; optional means possibly `undefined`, not `null`.
- Normalize external `null` at the boundary (e.g., request parsing, DB hydration).
- `tsconfig`: ensure `exactOptionalPropertyTypes: true`.

## 3 Function Design

### 3.1 Simple Over Complex

**Why:** Prefer simple, imperative solutions over complex functional abstractions. Every line of code is a potential bug and requires maintenance.

```ts
// Good - simple, imperative, easy to follow
async function processUsers(users: User[]) {
  const results = [] as ProcessedUser[];
  for (const user of users) {
    if (user.isActive) {
      const processed = await processUser(user);
      results.push(processed);
    }
  }
  return results;
}

// Bad - complex functional approach with custom types
const processUsersFancy = pipe(
  filter(isActive),
  traverseArray(Task.of),
  map(processUser),
  sequence(Task),
  fold(
    onError(handleError),
    onSuccess(identity)
  )
);

// Bad - TypeScript gymnastics that fight the language
type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T;

type RecursiveRequired<T> = T extends object ? { [P in keyof T]-?: RecursiveRequired<T[P]> } : T;

// Good - use built-in types or simple solutions
type UserUpdate = Partial<User>;
```

### 3.2 Balanced Function Decomposition

**Why:** Balance between monolithic functions and over-abstraction. Extract functions only when they encapsulate meaningful complexity or represent distinct business operations.

Extract when:

- Function encapsulates 30+ lines of complex logic
- Represents a distinct business operation
- Has multiple responsibilities that can be separated
- Contains complex error handling or transaction management
- Introduces a second abstraction level (loops inside loops, nested conditions)

Inline when:

- Simple string manipulation (`name.replace(/_id_seq$/, "")`)
- Basic array operations (`array.filter(condition)`)
- Trivial database query wrappers
- One-line utility functions
- Operations used only once

```ts
// Bad - excessive abstractions for trivial operations
function parseSequenceName(name: string): string {
  return name.replace(/_id_seq$/, "");
}

function findCommonColumns(source: string[], target: string[]): string[] {
  return source.filter(col => target.includes(col));
}

// Good - inline trivial operations
async function resetSequences(targetClient: PoolClient): Promise<void> {
  const sequencesResult = await targetClient.query(/* ... */);

  for (const seq of sequencesResult.rows) {
    const tableName = seq.sequence_name.replace(/_id_seq$/, ""); // Inline simple operations
    await targetClient.query(/* ... */);
  }
}

// Good - extract when there's meaningful complexity
async function syncTableData(
  sourceClient: PoolClient,
  targetClient: PoolClient,
  table: string,
  signal: AbortSignal,
): Promise<{ skipped: boolean }> {
  // 40+ lines of complex column mapping, data streaming, error handling
  // This encapsulates meaningful business logic
  return { skipped: false };
}

// Bad - monolithic function doing too much
function seedDatabaseAndValidateAndLogAndEmailAndCreateBackup() {
  // 230+ lines of nested logic...
}

// Good - clean orchestration using meaningful business operations
async function seedFromStaging(signal: AbortSignal): Promise<void> {
  let sourceClient: PoolClient | null = null;
  let targetClient: PoolClient | null = null;

  try {
    const sourcePool = new Pool({ connectionString: config.staging.directUrl });
    sourceClient = await sourcePool.connect();

    // Clear orchestration of business operations
    for (const table of tables) {
      await syncTableData(sourceClient, targetClient!, table, signal);
    }
    await resetSequences(targetClient!);
    await createSupabaseUsers(targetClient!);
  } finally {
    // ...
  }
}
```

### 3.3 Early Returns and Guard Clauses

**Why:** Reduces nesting, puts happy path at root indentation, fails fast.

```ts
// Good
function processUser(user: User | undefined): ProcessedUser {
  if (!user) {
    throw new Error('User is required');
  }

  if (!user.isActive) {
    throw new Error('User is inactive');
  }

  // Happy path at root indentation
  return transform(user);
}

// Bad - nested pyramid of doom
function processUserNested(user: User | undefined): ProcessedUser {
  if (user) {
    if (user.isActive) {
      return transform(user);
    } else {
      throw new Error('User is inactive');
    }
  } else {
    throw new Error('User is required');
  }
}
```

#### 3.3.1 Prefer Early Returns Over Accumulating State with let

Avoid patterns where you declare `let` variables and then mutate them across large `if/else` blocks. Instead, compute and return early for each branch; this keeps logic linear and types narrower.

```ts
// Bad - accumulating state with let + if/else chains
let template: Template | null = null;
let sections: Section[] = [];
if (forcedTemplateId) {
  template = await fetchTemplate(forcedTemplateId);
  sections = await fetchSections(template.id);
} else {
  const inferred = await inferTemplate(transcript);
  template = await fetchTemplate(inferred.id);
  sections = await fetchSections(template.id);
}
return { template: template!, sections };

// Good - early returns per branch
if (forcedTemplateId) {
  const template = await fetchTemplate(forcedTemplateId);
  const sections = await fetchSections(template.id);
  return { template, sections };
}
const inferred = await inferTemplate(transcript);
const template = await fetchTemplate(inferred.id);
const sections = await fetchSections(template.id);
return { template, sections };
```

### 3.4 Naming Conventions

**Why:** Clear, concise names make code self-documenting. Avoid redundancy and be specific.

```ts
// Good - concise, clear names
interface User {
  id: string;
  email: string;
  isActive: boolean;
}

function getUser(id: string): User { /* sync, O(1) lookup only */ }
async function fetchUser(id: string): Promise<User> { /* I/O */ }
async function loadDashboard(id: string): Promise<Dashboard> { /* I/O + compose */ }
async function saveUser(id: string, data: Partial<User>): Promise<void> { /* writes */ }

// Boolean naming - use is/has/can/should prefixes
const isActive = user.status === 'active';
const hasPermission = user.roles.includes('admin');
const canEdit = user.permissions.edit;
const shouldRetry = attempts < maxRetries;

// Time units - suffix with Ms for numbers representing milliseconds
const retryDelayMs = 250;
const timeoutMs = 5_000;

// Bad - redundant or unclear names
interface UserInterface { }  // Don't suffix interfaces
class UserClass { }          // Don't suffix classes
type UserType = { }          // Don't suffix types

function getUserById(userId: string) { }  // Prefer this shape only when multiple selectors exist (e.g. getUser, getUserByEmail)
function processUserDataAndSave() { }     // Too vague, doing multiple things
function doStuff() { }                    // Meaningless

// Bad - Hungarian notation or type prefixes
const strName = 'John';      // Type is obvious from TypeScript
const arrUsers = [];         // Don't encode type in name
const objConfig = {};        // Let TypeScript handle types

// Good - array naming is plural, clear what it contains
const users: User[] = [];
const activeUsers = users.filter(u => u.isActive);

// Bad - unclear array naming
const userArray: User[] = [];
const data = users.filter(u => u.isActive);  // What data?
```

### 3.5 Object Destructuring for Opaque Parameters

**Why:** When a parameter's type (e.g., `string`, `number`) doesn't convey its purpose, use object destructuring to make the function self-documenting.

```ts
// Good - parameter name is part of the signature
function subscribe({ eventId }: { eventId: string }): void { }
function fetchUser({ userId }: { userId: string }): Promise<User> { }
function cancelBot({ eventId }: { eventId: string }): Promise<void> { }

// Bad - "string" tells you nothing
function subscribe(eventId: string): void { }
function fetchUser(userId: string): Promise<User> { }
function cancelBot(eventId: string): Promise<void> { }
```

**When to apply:**

- Single string/number parameters where the type doesn't describe the value
- Multiple parameters of the same type (avoids argument order confusion)
- Public API boundaries (interfaces, exported functions)

**When to skip:**

- Private helper methods with obvious context
- Standard patterns like `formatDate(date: Date)` where the type is descriptive
- Primitive math utilities like `clamp(value: number, min: number, max: number)`

## 4 Error Handling

### 4.1 Single Try-Catch for Related Operations

**Why:** Group related operations in a single try-catch block for cleaner error handling. Avoid multiple try-catch blocks at the same level - extract operations to separate functions instead.

```ts
// Good - single try-catch for related operations
async function disconnectCalendar(calendarId: string) {
  try {
    const calendar = await getCalendar(calendarId);
    if (!calendar) {
      throw new NotFoundError('Calendar not found');
    }

    const events = await getEvents(calendar.id);

    // All related operations in one try block
    for (const event of events) {
      if (event.id) {
        await cancelBot(event.id);
        await deleteEvent(event.id);
      }
    }

    await deleteCalendar(calendar.id);
    await logAuditEvent(calendar);

    return { success: true, message: 'Calendar disconnected' };
  } catch (error) {
    logger.error(error, '[disconnect-calendar] error');

    if (error instanceof NotFoundError) {
      return { error: error.message, status: 404 };
    }

    if (error instanceof BadRequestError) {
      return { error: error.message, status: 400 };
    }

    return { error: 'Internal server error', status: 500 };
  }
}

// Good - extract unrelated operations to separate functions
async function setupUser(userData: UserData) {
  const user = await createUser(userData);

  // Handle optional operations separately
  await sendWelcomeEmailSafely(user.email);

  return user;
}

async function sendWelcomeEmailSafely(email: string) {
  try {
    await sendWelcomeEmail(email);
  } catch (error) {
    logger.warn(`Failed to send welcome email to ${email}: ${(error as Error).message}`);
  }
}

// Bad - multiple try-catch blocks for related operations
async function disconnectCalendarManyTrys(calendarId: string) {
  let calendar: Calendar;
  try {
    calendar = await getCalendar(calendarId);
  } catch (error) {
    return { error: 'Failed to get calendar' };
  }

  let events: Event[];
  try {
    events = await getEvents(calendar.id);
  } catch (error) {
    return { error: 'Failed to get events' };
  }
}
```

## 5 Data Manipulation

### 5.1 Immutable Updates vs Imperative Operations

**Why:** Use immutable updates for data transformations, but imperative patterns are often cleaner for business operations with side effects.

```ts
// Good - immutable updates for data transformations
function updateUser(user: User, updates: Partial<User>): User {
  return { ...user, ...updates };
}

// Good - nested immutable updates for pure data operations
function addItemToCart(cart: Cart, item: Item): Cart {
  return {
    ...cart,
    items: [...cart.items, item],
    total: cart.total + item.price,
  };
}

// Good - imperative for complex validation with early returns
function validateUserData(data: unknown): User {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid data format');
  }

  const obj = data as Record<string, unknown>;

  if (!obj.email || typeof obj.email !== 'string') {
    throw new Error('Email is required');
  }

  if (!obj.name || typeof obj.name !== 'string') {
    throw new Error('Name is required');
  }

  return { email: obj.email, name: obj.name } as User;
}
```

### 5.2 Choose the Right Iteration Pattern

**Why:** Different patterns work better in different contexts. Use array methods for pure transformations, loops for side effects and async operations.

```ts
// Good - array methods for pure data transformations
const activeAdminEmails = users
  .filter(u => u.isActive)
  .filter(u => u.role === 'admin')
  .map(u => u.email);

// Good - for loops for async operations with side effects
for (const event of eventsToDelete) {
  if (event.id) {
    await botsDomain.cancelBotForEvent(event.id);
    await calendarStorage.deleteEvent({ eventId: event.id });
  }
}

// Good - for loops when you need sequential processing
for (const user of users) {
  if (await shouldProcessUser(user)) {
    await processUser(user);
    await logUserProcessed(user);
  }
}

// Good - batched processing for high volume
const batchSize = 5;
for (let i = 0; i < users.length; i += batchSize) {
  const batch = users.slice(i, i + batchSize);
  await Promise.all(batch.map(processUser));
}

// Bad - array methods that force Promise.all when you need sequential
await Promise.all(
  users.map(async user => {
    if (await shouldProcessUser(user)) {
      await processUser(user); // This runs in parallel, might overwhelm DB
    }
  })
);

// Bad - forEach with async callbacks
users.forEach(async user => {
  await processUser(user); // fire-and-forget, order not guaranteed
});
```

## 6 Type Utilities

### 6.1 Type Predicates for Narrowing

**Why:** Provides type-safe runtime checks that TypeScript understands.

```ts
// Good - type predicate
function isUser(value: unknown): value is User {
  return typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'email' in value;
}

function isError(value: unknown): value is Error {
  return value instanceof Error;
}

// Usage - TypeScript narrows the type
if (isUser(data)) {
  console.log(data.email); // TypeScript knows data is User
}
```

### 6.2 Const Assertions

**Why:** Narrowest possible types without explicit annotation.

```ts
// Good
const ROLES = ['admin', 'user', 'guest'] as const;
type Role = typeof ROLES[number]; // 'admin' | 'user' | 'guest'

// Bad - loses type information
const ROLES2 = ['admin', 'user', 'guest'];
type AnyRole = string; // Too broad
```

#### Naming for const-asserted maps and derived unions

- Keep identifiers distinct for the runtime value and its derived union type (improves readability and import ergonomics).
- Using the same identifier for both a value and a type is valid but discouraged.

```ts
// Good - distinct names for value (runtime) and type
export const PublicWorkflowJobTypes = {
  TITLE_GENERATION: 'TITLE_GENERATION',
  // ... other entries ...
} as const;

export type PublicWorkflowJobType =
  (typeof PublicWorkflowJobTypes)[keyof typeof PublicWorkflowJobTypes];
```

### 6.3 No Enums - Use Const Object Pattern

**Why:**

1. **Single Source of Truth:** The `const` object serves as the single source for both runtime values and type definitions (via `typeof obj[keyof typeof obj]`). This avoids "magic strings" and ensures that type checking is grounded in actual runtime values, unlike raw string unions where type assertions are often the only check.
2. **Predictability:** Enums effectively introduce a "custom syntax" on top of JavaScript with unintuitive behaviors (like reverse mappings for numeric enums) that many developers find confusing. `const` objects are just standard JavaScript.
3. **Performance:** `const` objects compile to simple objects (or plain literals if inlined), ensuring zero runtime overhead and optimal tree-shaking, though the semantic benefits above are the primary driver.

**Pattern:**

```ts
// Good - const object + derived type
export const PublicVideoStatuses = {
  UPLOADING: "UPLOADING",
  CREATED: "CREATED",
  READY: "READY",
  ERROR: "ERROR",
  ARCHIVED: "ARCHIVED",
} as const;
export type PublicVideoStatus =
  (typeof PublicVideoStatuses)[keyof typeof PublicVideoStatuses];

// Bad - TypeScript enum
enum VideoStatus {
  UPLOADING = "UPLOADING",
  CREATED = "CREATED",
  // ...
}

// Bad - plain union (no runtime values)
type VideoStatus = "UPLOADING" | "CREATED" | "READY" | "ERROR" | "ARCHIVED";
```

**Naming convention:**

- **Const object**: Plural form (`PublicVideoStatuses`, `PublicJobExecutionStatuses`)
- **Derived type**: Singular form (`PublicVideoStatus`, `PublicJobExecutionStatus`)
- Keep both names distinct for clear imports

**Usage:**

```ts
// Runtime comparison (use the const object)
if (video.status === PublicVideoStatuses.READY) { ... }

// Type annotation (use the derived type)
function processVideo(status: PublicVideoStatus): void { ... }

// Exhaustive switch
function getStatusLabel(status: PublicVideoStatus): string {
  switch (status) {
    case PublicVideoStatuses.UPLOADING: return "アップロード中";
    case PublicVideoStatuses.READY: return "準備完了";
    // TypeScript ensures all cases are covered
  }
}
```

**Reference:** See `apps/web/src/lib/domain/` for canonical examples (e.g., `video/video.ts`, `job/job.ts`, `workflow/workflow.ts`).

## 7 Async Patterns

### 7.1 Async/Await Over Promise Chains

**Why:** Linear flow, better error handling, easier debugging.

```ts
// Good
async function fetchUserData(id: string): Promise<UserData> {
  const user = await fetchUser(id);
  const profile = await fetchProfile(user.profileId);
  return { user, profile };
}

// Bad - callback hell
function fetchUserDataChained(id: string): Promise<UserData> {
  return fetchUser(id)
    .then(user => fetchProfile(user.profileId)
      .then(profile => ({ user, profile })));
}
```

### 7.2 Sequential vs Parallel Processing

**Why:** Sequential processing is safer for side effects, parallel processing is better for independent operations. Choose based on the operation's requirements.

```ts
// Good - sequential for operations with side effects
async function disconnectCalendar(calendarId: string) {
  const eventsToDelete = await getEvents(calendarId);

  // Process events sequentially to avoid overwhelming external APIs
  for (const event of eventsToDelete) {
    if (event.id) {
      await cancelBotForEvent(event.id);     // External API call
      await deleteEventFromDB(event.id);     // Database operation
    }
  }

  await deleteCalendar(calendarId);
}

// Bad - parallel processing that can overwhelm external services
async function disconnectCalendarParallel(calendarId: string) {
  const eventsToDelete = await getEvents(calendarId);
  await Promise.allSettled(
    eventsToDelete.map(async event => {
      if (event.id) {
        await cancelBotForEvent(event.id);
        await deleteEventFromDB(event.id);
      }
    })
  );
}
```

## 8 Module Design

### 8.1 Dependency Injection Over Singletons

**Why:** Testable, configurable, explicit dependencies. Classes work well for stateful services with multiple dependencies.

```ts
// Good - class-based dependency injection for complex services
export class RecallCalendarsApiImpl implements RecallCalendarsApi {
  constructor(
    private readonly router: Router = express.Router(),
    private readonly calendarStorage: CalendarStorage,
    private readonly recallApiClient: RecallApiClient,
    private readonly auditLogger: AuditLogger,
    private readonly botsDomain: BotsDomain,
    private readonly logger: Logger,
  ) {}

  async disconnectCalendar(calendarId: string) {
    this.logger.debug('[disconnect-calendar] request received');

    try {
      const calendar = await this.calendarStorage.getCalendar(calendarId);
      const events = await this.calendarStorage.getEvents(calendar.id);

      for (const event of events) {
        await this.botsDomain.cancelBot(event.id);
        await this.calendarStorage.deleteEvent(event.id);
      }

      await this.recallApiClient.deleteCalendar(calendar.recall_id);
      await this.auditLogger.log({ action: 'calendar.disconnected' });

    } catch (error) {
      this.logger.error(error, '[disconnect-calendar] error');
      throw error;
    }
  }
}

// Good - functional approach for simpler operations
interface UserRepository {
  create(user: User): Promise<User>;
  findById(id: string): Promise<User | null>;
}

interface Logger {
  info(message: string): void;
  error(error: Error, message: string): void;
}

async function createUser(
  userData: UserData,
  userRepo: UserRepository,
  logger: Logger,
): Promise<User> {
  logger.info(`Creating user: ${userData.email}`);

  try {
    return await userRepo.create(userData);
  } catch (error) {
    logger.error(error as Error, 'Failed to create user');
    throw error;
  }
}
```

### 8.3 Exports & File Naming

- Prefer named exports in backend code; reach for default exports only when the module truly presents a single concept (config, logger, etc.).
- Top-level names: PascalCase for types/classes, camelCase for values.
- One module = one responsibility; avoid `index.ts` barrels unless they truly clarify usage.

## 9 Refactoring Approach

### 9.1 From Monolith to Balanced Decomposition

**Why:** Large monolithic functions are hard to understand, but excessive decomposition creates indirection. Strike a balance by extracting functions that represent meaningful business operations.

```ts
// Stage 1: Monolithic function (hard to read/maintain)
async function seedDatabase(signal: AbortSignal): Promise<void> {
  // 230+ lines of:
  // - Database connection logic
  // - Table discovery and filtering
  // - Complex column mapping per table
  // - Data streaming with error handling
  // - Sequence resetting logic
  // - Supabase user creation with tracking
  // - Transaction management
  // - Progress reporting
}

// Stage 2: Over-abstracted (too many trivial helpers)
function parseSequenceName(name: string): string { return name.replace(/_id_seq$/, ""); }
function findCommonColumns(source: string[], target: string[]): string[] { return source.filter(col => target.includes(col)); }
async function getTableColumns(client: PoolClient, table: string): Promise<string[]> { /* Simple query wrapper */ return []; }

// Stage 3: Balanced decomposition (extract meaningful operations)
async function syncTableData(
  sourceClient: PoolClient,
  targetClient: PoolClient,
  table: string,
  signal: AbortSignal,
): Promise<{ skipped: boolean }> {
  // 40+ lines of complex column mapping, data streaming, error handling
  return { skipped: false };
}

async function resetSequences(targetClient: PoolClient): Promise<void> {
  // Meaningful database operation
  const tableName = seq.sequence_name.replace(/_id_seq$/, ""); // Inline simple operations
}

async function createSupabaseUsers(targetClient: PoolClient): Promise<void> {
  // Distinct business operation for user management
}

async function seedFromStaging(signal: AbortSignal): Promise<void> {
  // Clean orchestration function
  // - Database setup
  // - Transaction management
  // - Calling business operations
  // - Error handling
}
```

### 9.2 Refactoring & Anti-Patterns

**Why:** Keep code obvious by iterating in stages, avoiding abstraction or optimization until the third time you feel the pain.

**Do:**

- Start with the direct implementation; extract helpers only when they encapsulate meaningful business logic.
- Duplicate logic on the second occurrence, then factor a helper on the third.
- Keep related logic together; prefer pragmatic refactors over scattering files across faux layers.

**Avoid:**

- Abstractions invented after a single use (e.g., `AbstractDataProcessor` classes).
- Clever function composition helpers when sequential code is clearer.
- Premature caches, memoization, or micro-optimizations without evidence.
- Dynamic property access that defeats type safety.
