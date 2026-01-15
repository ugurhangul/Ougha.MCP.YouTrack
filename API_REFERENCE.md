# Ougha.MCP.YouTrack - Complete API Reference

## Tool Schemas & Parameters

### Issue Management Tools

#### `create-issue`
**Description**: Create a new issue in YouTrack (optionally as a subtask)
⚠️ **Important**: Use project **ID** (e.g., `"0-1"`) not shortName (e.g., `"QM"`) to avoid 400 errors

**Parameters**:
```typescript
{
  project: string;              // Project ID (required) - Use ID like "0-1", NOT shortName like "QM"
  summary: string;              // Issue summary/title (required)
  description?: string;         // Issue description (optional)
  assignee?: string;           // Assignee user ID or login (optional)
  priority?: string;           // Priority name (optional)
  type?: string;               // Issue type name (optional)
  estimationMinutes?: number;  // Initial time estimation in minutes (optional, min: 0)
  storyPoints?: number;        // Story points value (optional, min: 0)
  customFields?: Record<string, any>; // Custom field values as key-value pairs (optional)
  parentIssue?: string;        // Parent issue ID to create this as a subtask (optional)
}
```

**Example**:
```javascript
{
  "project": "0-1",
  "summary": "Bug: Login page not working",
  "description": "Users cannot log in after recent update",
  "assignee": "john.doe",
  "priority": "Critical",
  "type": "Bug",
  "estimationMinutes": 240,
  "storyPoints": 8,
  "customFields": {
    "Component": "Frontend",
    "Severity": "High"
  }
}
```
⚠️ **Critical**: Always use project **ID** (e.g., `"0-1"`) not shortName (e.g., `"QM"`). Use `list-projects` to get the correct ID.

#### `get-issue`
**Description**: Get issue details by ID

**Parameters**:
```typescript
{
  issueId: string; // Issue ID (e.g., PROJECT-123) (required)
}
```

#### `update-issue`
**Description**: Update an existing issue

**Parameters**:
```typescript
{
  issueId: string;              // Issue ID (e.g., PROJECT-123) (required)
  summary?: string;             // New issue summary/title (optional)
  description?: string;         // New issue description (optional)
  assignee?: string;           // New assignee user ID or login (optional)
  state?: string;              // New state name (optional)
  priority?: string;           // New priority name (optional)
  estimationMinutes?: number;  // New time estimation in minutes (optional, min: 0)
  storyPoints?: number;        // New story points value (optional, min: 0)
  customFields?: Record<string, any>; // Custom field values to update (optional)
}
```

#### `search-issues`
**Description**: Search issues with basic filters

**Parameters**:
```typescript
{
  query?: string;    // YouTrack search query (optional)
  project?: string;  // Filter by project ID or short name (optional)
  assignee?: string; // Filter by assignee user ID or login (optional)
  state?: string;    // Filter by state name (optional)
  limit?: number;    // Maximum number of issues to return (optional, min: 1, max: 100, default: 20)
  skip?: number;     // Number of issues to skip for pagination (optional, min: 0, default: 0)
}
```

#### `add-comment`
**Description**: Add a comment to an issue

**Parameters**:
```typescript
{
  issueId: string; // Issue ID (e.g., PROJECT-123) (required)
  text: string;    // Comment text (required)
}
```

### Project Management Tools

#### `list-projects`
**Description**: List all projects in YouTrack

**Parameters**:
```typescript
{
  includeArchived?: boolean; // Include archived projects (optional)
}
```

#### `get-project`
**Description**: Get project details by ID or short name

**Parameters**:
```typescript
{
  projectId: string; // Project ID or short name (required)
}
```

### User Management Tools

#### `get-current-user`
**Description**: Get current user information

**Parameters**:
```typescript
{} // No parameters required
```

#### `list-users`
**Description**: List users in YouTrack

**Parameters**:
```typescript
{
  query?: string;        // Search query for users (optional)
  limit?: number;        // Maximum number of users to return (optional)
  includeBanned?: boolean; // Include banned users (optional)
}
```

#### `get-user`
**Description**: Get user details by ID or login

**Parameters**:
```typescript
{
  userId: string; // User ID or login (required)
}
```

### Advanced Search Tools

#### `search-issues-advanced`
**Description**: Advanced issue search using YouTrack query language

**Parameters**:
```typescript
{
  query: string;              // YouTrack query language string (required)
  limit?: number;             // Maximum number of issues to return (optional)
  skip?: number;              // Number of issues to skip for pagination (optional)
  includeDescription?: boolean; // Include issue descriptions in results (optional)
}
```

**YouTrack Query Examples**:
```
assignee: me State: Open
project: MyProject created: today
priority: Critical assignee: unassigned
updated: -7d .. today State: {In Progress}
reporter: john.doe project: ABC,XYZ
```

#### `search-users-by-name`
**Description**: Search users by name or login

**Parameters**:
```typescript
{
  name: string;         // Name or login to search for (required)
  limit?: number;       // Maximum number of users to return (optional)
  exactMatch?: boolean; // Use exact match instead of partial (optional)
}
```

#### `get-my-issues`
**Description**: Get issues assigned to current user

**Parameters**:
```typescript
{
  state?: string;   // Filter by state name (optional)
  project?: string; // Filter by project ID or short name (optional)
  limit?: number;   // Maximum number of issues to return (optional)
}
```

#### `get-recent-issues`
**Description**: Get recently updated issues

**Parameters**:
```typescript
{
  project?: string; // Filter by project ID or short name (optional)
  days?: number;    // Number of days to look back (optional)
  limit?: number;   // Maximum number of issues to return (optional)
}
```

### Time Tracking Tools

#### `get-work-items`
**Description**: Get work items (time logs) for an issue

**Parameters**:
```typescript
{
  issueId: string; // Issue ID (e.g., PROJECT-123) (required)
}
```

#### `create-work-item`
**Description**: Create a work item (log time) for an issue

**Parameters**:
```typescript
{
  issueId: string;      // Issue ID (e.g., PROJECT-123) (required)
  duration: number;     // Duration in minutes (required)
  description?: string; // Work description (optional)
  type?: string;        // Work item type name (optional)
  date?: number;        // Unix timestamp for work date (optional, defaults to current time)
}
```

#### `update-work-item`
**Description**: Update an existing work item

**Parameters**:
```typescript
{
  issueId: string;      // Issue ID (e.g., PROJECT-123) (required)
  workItemId: string;   // Work item ID (required)
  duration?: number;    // New duration in minutes (optional)
  description?: string; // New work description (optional)
  type?: string;        // New work item type name (optional)
  date?: number;        // New Unix timestamp for work date (optional)
}
```

#### `delete-work-item`
**Description**: Delete a work item

**Parameters**:
```typescript
{
  issueId: string;    // Issue ID (e.g., PROJECT-123) (required)
  workItemId: string; // Work item ID (required)
}
```

#### `set-estimation`
**Description**: Set or update time estimation for an issue

**Parameters**:
```typescript
{
  issueId: string;           // Issue ID (e.g., PROJECT-123) (required)
  estimationMinutes: number; // Estimation in minutes (required, min: 0)
}
```

#### `get-time-summary`
**Description**: Get comprehensive time tracking summary for an issue

**Parameters**:
```typescript
{
  issueId: string; // Issue ID (e.g., PROJECT-123) (required)
}
```

### Issue Relations & Dependencies Tools

#### `get-issue-links`
**Description**: Get issue links and dependencies for an issue

**Parameters**:
```typescript
{
  issueId: string; // Issue ID (e.g., PROJECT-123) (required)
}
```

#### `create-issue-link`
**Description**: Create a link between two issues (dependency, relation, etc.)

**Parameters**:
```typescript
{
  issueId: string;      // Source issue ID (e.g., PROJECT-123) (required)
  targetIssue: string;  // Target issue ID (e.g., PROJECT-456) (required)
  linkType: string;     // Link type name (e.g., "Depends on", "Blocks", "Relates to") (required)
  direction?: string;   // Direction of the link: "OUTWARD" or "INWARD" (optional, default: "OUTWARD")
}
```

**Example**:
```javascript
{
  "issueId": "PROJECT-123",
  "targetIssue": "PROJECT-456",
  "linkType": "Depends on",
  "direction": "OUTWARD"
}
```

#### `delete-issue-link`
**Description**: Delete an issue link

**Parameters**:
```typescript
{
  issueId: string; // Issue ID (e.g., PROJECT-123) (required)
  linkId: string;  // Link ID to delete (required)
}
```

#### `get-link-types`
**Description**: Get available issue link types

**Parameters**:
```typescript
{
  projectId?: string; // Project ID or short name (optional, if not provided returns global link types)
}
```

### Subtask Management Tools

#### `create-subtask`
**Description**: Create a new subtask and automatically link it to a parent issue

**Parameters**:
```typescript
{
  parentIssueId: string;        // Parent issue ID (e.g., PROJECT-123) (required)
  summary: string;              // Subtask summary/title (required)
  description?: string;         // Subtask description (optional)
  assignee?: string;           // Assignee user ID or login (optional)
  priority?: string;           // Priority name (optional)
  type?: string;               // Issue type name (optional)
  estimationMinutes?: number;  // Initial time estimation in minutes (optional, min: 0)
  storyPoints?: number;        // Story points value (optional, min: 0)
  customFields?: Record<string, any>; // Custom field values as key-value pairs (optional)
}
```

**Example**:
```javascript
{
  "parentIssueId": "PROJECT-123",
  "summary": "Implement user authentication",
  "description": "Add login and registration functionality",
  "assignee": "john.doe",
  "priority": "High",
  "estimationMinutes": 240,
  "storyPoints": 5
}
```

#### `get-subtasks`
**Description**: Get all subtasks of a parent issue

**Parameters**:
```typescript
{
  parentIssueId: string;      // Parent issue ID (e.g., PROJECT-123) (required)
  includeCompleted?: boolean; // Include completed/resolved subtasks (optional, default: false)
  includeDetails?: boolean;   // Include detailed subtask information (optional, default: true)
}
```

#### `get-parent-issue`
**Description**: Get the parent issue of a subtask

**Parameters**:
```typescript
{
  subtaskIssueId: string; // Subtask issue ID (e.g., PROJECT-456) (required)
}
```

#### `convert-to-subtask`
**Description**: Convert an existing issue to a subtask of another issue

**Parameters**:
```typescript
{
  issueId: string;       // Issue ID to convert to subtask (e.g., PROJECT-456) (required)
  parentIssueId: string; // Parent issue ID (e.g., PROJECT-123) (required)
}
```

#### `create-multiple-subtasks`
**Description**: Create multiple subtasks for a parent issue in one operation

**Parameters**:
```typescript
{
  parentIssueId: string; // Parent issue ID (e.g., PROJECT-123) (required)
  subtasks: Array<{      // Array of subtasks to create (required, min: 1, max: 20)
    summary: string;              // Subtask summary/title (required)
    description?: string;         // Subtask description (optional)
    assignee?: string;           // Assignee user ID or login (optional)
    priority?: string;           // Priority name (optional)
    type?: string;               // Issue type name (optional)
    estimationMinutes?: number;  // Initial time estimation in minutes (optional, min: 0)
    storyPoints?: number;        // Story points value (optional, min: 0)
    customFields?: Record<string, any>; // Custom field values as key-value pairs (optional)
  }>;
}
```

**Example**:
```javascript
{
  "parentIssueId": "PROJECT-123",
  "subtasks": [
    {
      "summary": "Frontend implementation",
      "description": "Create React components",
      "assignee": "frontend.dev",
      "priority": "High",
      "storyPoints": 3
    },
    {
      "summary": "Backend API",
      "description": "Implement REST endpoints",
      "assignee": "backend.dev",
      "priority": "High",
      "estimationMinutes": 180
    }
  ]
}
```

### Story Points Tools

#### `set-story-points`
**Description**: Set story points for an issue

**Parameters**:
```typescript
{
  issueId: string;     // Issue ID (e.g., PROJECT-123) (required)
  storyPoints: number; // Story points value (e.g., 1, 2, 3, 5, 8, 13, 21) (required, min: 0)
}
```

#### `get-story-points`
**Description**: Get story points for an issue

**Parameters**:
```typescript
{
  issueId: string; // Issue ID (e.g., PROJECT-123) (required)
}
```

## Response Formats

### Success Response
```typescript
{
  content: [
    {
      type: "text",
      text: string // Formatted response text with markdown
    }
  ]
}
```

### Error Response
```typescript
{
  content: [
    {
      type: "text", 
      text: string // Error message
    }
  ],
  isError: true
}
```

## Data Types & Formats

### Timestamps
- All timestamps are Unix timestamps in milliseconds
- Use `new Date(timestamp).toLocaleString()` for display

### Duration
- All durations are in minutes
- Common conversions: 1 hour = 60 minutes, 1 day = 480 minutes (8 hours)

### Custom Fields
- Passed as simple key-value pairs
- Special handling for time estimations:
  ```javascript
  {
    "Estimation": {
      "minutes": 240,
      "$type": "PeriodIssueCustomField"
    }
  }
  ```

### User References
- Can use either user ID or login name
- Recommend using `search-users-by-name` to verify user exists

### Project References  
- Can use either project ID or short name
- Recommend using `list-projects` to verify project exists

## Error Codes & Messages

### Common Error Types
- **Authentication Error**: Invalid or expired token
- **Permission Error**: Insufficient permissions for operation
- **Not Found Error**: Resource (issue, user, project) not found
- **Validation Error**: Invalid parameter values
- **Rate Limit Error**: Too many requests (handled automatically)

### Error Handling Best Practices
1. Always check for `isError: true` in responses
2. Parse error messages for specific guidance
3. Use search tools to validate IDs before operations
4. Implement retry logic for transient errors
