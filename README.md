# Ougha.MCP.YouTrack

A Model Context Protocol (MCP) server that integrates with JetBrains YouTrack's REST API, providing comprehensive tools for issue tracking, project management, and user administration.

## Features

### 🎯 Issue Management
- **Create Issues**: Create new issues with custom fields, assignees, priorities, and story points
  - ⚠️ **Important**: Use project **ID** (e.g., `"0-1"`) not shortName (e.g., `"QM"`) to avoid 400 errors
- **Get Issue Details**: Retrieve comprehensive issue information including comments and custom fields
- **Update Issues**: Modify issue properties, assignees, states, custom fields, and story points
- **Search Issues**: Basic and advanced search with YouTrack query language support
- **Add Comments**: Add comments to existing issues
- **Delete Issues**: Permanently delete issues (⚠️ **WARNING**: Cannot be undone!)

### 📋 Subtask Management
- **Create Subtasks**: Create new subtasks and automatically link them to parent issues
- **Get Subtasks**: Retrieve all subtasks of a parent issue with filtering options
- **Get Parent Issue**: Find the parent issue of any subtask
- **Convert to Subtask**: Convert existing issues to subtasks of other issues
- **Bulk Subtask Creation**: Create multiple subtasks in one operation
- **Enhanced Issue Creation**: Create issues as subtasks using the parentIssue parameter

### 🔗 Issue Relations & Dependencies
- **Issue Links**: Create, view, and delete links between issues (depends on, blocks, relates to, etc.)
- **Link Types**: Get available link types for projects
- **Dependencies**: Manage task dependencies and relationships
- **Parent-Child Relations**: Support for subtasks and parent issue relationships

### 📊 Story Points Management
- **Set Story Points**: Assign story points to issues for agile estimation
- **Get Story Points**: Retrieve story points for issues
- **Integrated Display**: Story points shown in issue details and search results

### 📁 Project Management
- **List Projects**: View all projects with filtering options for archived projects
- **Get Project Details**: Retrieve detailed project information including leaders and descriptions

### 👥 User Management
- **Current User Info**: Get information about the authenticated user
- **List Users**: Browse users with search and filtering capabilities
- **Get User Details**: Retrieve detailed user information by ID or login
- **Search Users**: Find users by name or login with exact match options

### 🔍 Advanced Search
- **Advanced Issue Search**: Use YouTrack's powerful query language for complex searches
- **My Issues**: Get issues assigned to the current user with filtering
- **Recent Issues**: Find recently updated issues within specified time ranges
- **User Search**: Search for users by name with flexible matching

## Installation

### Prerequisites
- Node.js 18.0.0 or higher
- YouTrack instance with API access
- YouTrack permanent token

### Setup

1. **Clone or download this repository**
   ```bash
   git clone https://github.com/ugurhangul/youtrackMCP.git
   cd Ougha.MCP.YouTrack
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and set your YouTrack configuration:
   ```env
   YOUTRACK_URL=https://your-company.youtrack.cloud
   YOUTRACK_TOKEN=your-permanent-token
   YOUTRACK_TIMEOUT=30000
   YOUTRACK_RATE_LIMIT=60
   DEBUG=false
   ```

4. **Build the server**
   ```bash
   npm run build
   ```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `YOUTRACK_URL` | ✅ | - | Your YouTrack instance URL |
| `YOUTRACK_TOKEN` | ✅ | - | YouTrack permanent token |
| `YOUTRACK_TIMEOUT` | ❌ | 30000 | Request timeout in milliseconds |
| `YOUTRACK_RATE_LIMIT` | ❌ | 60 | Max requests per minute |
| `DEBUG` | ❌ | false | Enable debug logging |

### Getting a YouTrack Token

1. Log in to your YouTrack instance
2. Go to your profile (click your avatar)
3. Navigate to **Account Security** → **Tokens**
4. Click **New Token**
5. Set appropriate permissions and create the token
6. Copy the token to your `.env` file

## Usage

### Running the Server

```bash
npm start
```

### Using with Claude Desktop

Add the server to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ougha-youtrack": {
      "command": "node",
      "args": ["/absolute/path/to/Ougha.MCP.YouTrack/build/index.js"],
      "env": {
        "YOUTRACK_URL": "https://your-company.youtrack.cloud",
        "YOUTRACK_TOKEN": "your-permanent-token"
      }
    }
  }
}
```

### Example Commands

Once connected to an MCP client, you can use natural language commands like:

- "Create a new bug in project ABC with summary 'Login page not working'"
- "Show me all issues assigned to me"
- "Get details for issue ABC-123"
- "List all projects"
- "Search for issues updated in the last 7 days"
- "Find user john.doe"
- "Update issue ABC-123 to assign it to jane.smith"

## Available Tools

### Issue Management
- `create-issue` - Create a new issue (now supports story points)
- `get-issue` - Get issue details by ID
- `update-issue` - Update an existing issue (now supports story points)
- `search-issues` - Search issues with basic filters
- `add-comment` - Add a comment to an issue
- `delete-issue` - Delete an issue permanently (⚠️ **WARNING**: Cannot be undone!)

### Issue Relations & Dependencies
- `get-issue-links` - Get issue links and dependencies for an issue
- `create-issue-link` - Create a link between two issues (dependency, relation, etc.)
- `delete-issue-link` - Delete an issue link
- `get-link-types` - Get available issue link types

### Story Points
- `set-story-points` - Set story points for an issue
- `get-story-points` - Get story points for an issue

### Project Management
- `list-projects` - List all projects
- `get-project` - Get project details

### User Management
- `get-current-user` - Get current user information
- `list-users` - List users
- `get-user` - Get user details

### Advanced Search
- `search-issues-advanced` - Advanced search with YouTrack query language
- `search-users-by-name` - Search users by name
- `get-my-issues` - Get issues assigned to current user
- `get-recent-issues` - Get recently updated issues

### Time Tracking
- `get-work-items` - Get work items (time logs) for an issue
- `create-work-item` - Create a work item (log time) for an issue
- `update-work-item` - Update an existing work item
- `delete-work-item` - Delete a work item
- `set-estimation` - Set or update time estimation for an issue
- `get-time-summary` - Get comprehensive time tracking summary for an issue

## Time Tracking Examples

### Creating Issues with Estimations
```json
{
  "tool": "create-issue",
  "arguments": {
    "project": "0-1",
    "summary": "Implement new feature",
    "description": "Feature description",
    "estimationMinutes": 480,
    "assignee": "user-id"
  }
}
```
⚠️ **Important**: Use project **ID** (e.g., `"0-1"`) not shortName (e.g., `"QM"`). Get the correct ID using `list-projects` tool.

### Logging Time (Creating Work Items)
```json
{
  "tool": "create-work-item",
  "arguments": {
    "issueId": "PROJECT-123",
    "duration": 120,
    "description": "Development work",
    "type": "Development"
  }
}
```

### Getting Time Summary
```json
{
  "tool": "get-time-summary",
  "arguments": {
    "issueId": "PROJECT-123"
  }
}
```

## Issue Relations & Dependencies Examples

### Creating Issue Dependencies
```json
{
  "tool": "create-issue-link",
  "arguments": {
    "issueId": "PROJECT-123",
    "targetIssue": "PROJECT-456",
    "linkType": "Depends on",
    "direction": "OUTWARD"
  }
}
```

### Getting Issue Links
```json
{
  "tool": "get-issue-links",
  "arguments": {
    "issueId": "PROJECT-123"
  }
}
```

### Getting Available Link Types
```json
{
  "tool": "get-link-types",
  "arguments": {
    "projectId": "PROJECT-ID"
  }
}
```

## Story Points Examples

### Setting Story Points
```json
{
  "tool": "set-story-points",
  "arguments": {
    "issueId": "PROJECT-123",
    "storyPoints": 8
  }
}
```

### Creating Issues with Story Points
```json
{
  "tool": "create-issue",
  "arguments": {
    "project": "0-1",
    "summary": "Implement user authentication",
    "description": "Add OAuth2 authentication",
    "storyPoints": 13,
    "estimationMinutes": 480,
    "assignee": "user-id"
  }
}
```
⚠️ **Important**: Use project **ID** (e.g., `"0-1"`) not shortName (e.g., `"QM"`). Get the correct ID using `list-projects` tool.

## YouTrack Query Language Examples

The `search-issues-advanced` tool supports YouTrack's powerful query language:

```
assignee: me State: Open
project: MyProject created: today
priority: Critical assignee: unassigned
updated: -7d .. today State: {In Progress}
reporter: john.doe project: ABC,XYZ
```

## Error Handling

The server includes comprehensive error handling for:
- Network connectivity issues
- Authentication failures
- Rate limiting (with automatic retry)
- Invalid requests
- YouTrack API errors

## Rate Limiting

The server implements intelligent rate limiting:
- Configurable requests per minute limit
- Automatic request queuing when rate limited
- Exponential backoff for failed requests
- Respect for YouTrack's rate limiting headers


## Development

### Building
```bash
npm run build
```

### Cleaning Build Files
```bash
npm run clean
```

## Troubleshooting

### Connection Issues
1. Verify your YouTrack URL is correct and accessible
2. Check that your permanent token has sufficient permissions
3. Ensure your YouTrack instance allows API access

### Authentication Errors
1. Regenerate your permanent token in YouTrack
2. Verify the token has the necessary permissions:
   - Read issues, projects, users
   - Create/update issues (if needed)
   - Read project administration data

### Rate Limiting
If you encounter rate limiting:
1. Reduce the `YOUTRACK_RATE_LIMIT` value
2. Check if other applications are using the same token
3. Consider using multiple tokens for different applications

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review [YouTrack API documentation](https://www.jetbrains.com/help/youtrack/devportal/api-reference.html)
3. Create an issue in this repository
