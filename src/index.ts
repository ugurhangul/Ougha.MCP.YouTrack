#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getConfig, logConfigInfo } from './config.js';
import { YouTrackClient } from './youtrack-client.js';

// Import tool functions and schemas
import {
  createIssue, updateIssue, getIssue, searchIssues, addComment, deleteIssue,
  createIssueSchema, updateIssueSchema, getIssueSchema, searchIssuesSchema, addCommentSchema, deleteIssueSchema
} from './tools/issue-tools.js';

import {
  listProjects, getProject,
  listProjectsSchema, getProjectSchema
} from './tools/project-tools.js';

import {
  getCurrentUser, listUsers, getUser,
  getCurrentUserSchema, listUsersSchema, getUserSchema
} from './tools/user-tools.js';

import {
  searchIssuesAdvanced, searchUsersByName, getMyIssues, getRecentIssues,
  searchIssuesAdvancedSchema, searchUsersByNameSchema, getMyIssuesSchema, getRecentIssuesSchema
} from './tools/search-tools.js';

import {
  getWorkItems, createWorkItem, updateWorkItem, deleteWorkItem, setEstimation, getTimeSummary,
  getWorkItemsSchema, createWorkItemSchema, updateWorkItemSchema, deleteWorkItemSchema, setEstimationSchema, getTimeSummarySchema
} from './tools/time-tracking-tools.js';

import {
  getIssueLinks, createIssueLink, deleteIssueLink, getLinkTypes,
  getIssueLinksSchema, createIssueLinkSchema, deleteIssueLinkSchema, getLinkTypesSchema
} from './tools/issue-links-tools.js';

import {
  createSubtask, getSubtasks, getParentIssue, convertToSubtask, createMultipleSubtasks,
  createSubtaskSchema, getSubtasksSchema, getParentIssueSchema, convertToSubtaskSchema, createMultipleSubtasksSchema
} from './tools/subtask-tools.js';

import {
  setStoryPoints, getStoryPoints,
  setStoryPointsSchema, getStoryPointsSchema
} from './tools/story-points-tools.js';

import {
  getGanttData, exportGanttChart, updateIssueTimeline, getProjectTimeline, calculateCriticalPath, getTimelineConflicts,
  getGanttDataSchema, exportGanttChartSchema, updateIssueTimelineSchema, getProjectTimelineSchema, calculateCriticalPathSchema, getTimelineConflictsSchema
} from './tools/gantt-tools.js';

/**
 * Ougha.MCP.YouTrack
 *
 * Provides Model Context Protocol tools for interacting with JetBrains YouTrack
 */
async function main() {
  try {
    // Load and validate configuration
    const config = getConfig();
    logConfigInfo(config);

    // Initialize YouTrack client
    const youtrackClient = new YouTrackClient(config);

    // Test connection
    console.error('Testing YouTrack connection...');
    const isConnected = await youtrackClient.testConnection();
    if (!isConnected) {
      throw new Error('Failed to connect to YouTrack. Please check your configuration.');
    }
    console.error('✅ Successfully connected to YouTrack');

    // Create MCP server
    const server = new McpServer({
      name: "ougha-mcp-youtrack",
      version: "1.0.0",
      capabilities: {
        tools: {},
      },
    });

    // Register Issue Management Tools
    server.tool(
      "create-issue",
      "Create a new issue in YouTrack (optionally as a subtask)",
      createIssueSchema.shape,
      async ({ project, summary, description, assignee, priority, type, estimationMinutes, storyPoints, customFields, parentIssue }) => {
        return createIssue(youtrackClient, { project, summary, description, assignee, priority, type, estimationMinutes, storyPoints, customFields, parentIssue });
      }
    );

    server.tool(
      "get-issue",
      "Get issue details by ID",
      getIssueSchema.shape,
      async ({ issueId }) => {
        return getIssue(youtrackClient, { issueId });
      }
    );

    server.tool(
      "update-issue",
      "Update an existing issue",
      updateIssueSchema.shape,
      async ({ issueId, summary, description, assignee, state, priority, estimationMinutes, storyPoints, customFields }) => {
        return updateIssue(youtrackClient, { issueId, summary, description, assignee, state, priority, estimationMinutes, storyPoints, customFields });
      }
    );

    server.tool(
      "search-issues",
      "Search issues with basic filters",
      searchIssuesSchema.shape,
      async ({ query, project, assignee, state, limit, skip }) => {
        return searchIssues(youtrackClient, { query, project, assignee, state, limit, skip });
      }
    );

    server.tool(
      "add-comment",
      "Add a comment to an issue",
      addCommentSchema.shape,
      async ({ issueId, text }) => {
        return addComment(youtrackClient, { issueId, text });
      }
    );

    server.tool(
      "delete-issue",
      "Delete an issue permanently (WARNING: This operation cannot be undone!)",
      deleteIssueSchema.shape,
      async ({ issueId }) => {
        return deleteIssue(youtrackClient, { issueId });
      }
    );

    // Register Project Management Tools
    server.tool(
      "list-projects",
      "List all projects in YouTrack",
      listProjectsSchema.shape,
      async ({ includeArchived }) => {
        return listProjects(youtrackClient, { includeArchived });
      }
    );

    server.tool(
      "get-project",
      "Get project details by ID or short name",
      getProjectSchema.shape,
      async ({ projectId }) => {
        return getProject(youtrackClient, { projectId });
      }
    );

    // Register User Management Tools
    server.tool(
      "get-current-user",
      "Get current user information",
      getCurrentUserSchema.shape,
      async ({ }) => {
        return getCurrentUser(youtrackClient, {});
      }
    );

    server.tool(
      "list-users",
      "List users in YouTrack",
      listUsersSchema.shape,
      async ({ query, limit, includeBanned }) => {
        return listUsers(youtrackClient, { query, limit, includeBanned });
      }
    );

    server.tool(
      "get-user",
      "Get user details by ID or login",
      getUserSchema.shape,
      async ({ userId }) => {
        return getUser(youtrackClient, { userId });
      }
    );

    // Register Advanced Search Tools
    server.tool(
      "search-issues-advanced",
      "Advanced issue search using YouTrack query language",
      searchIssuesAdvancedSchema.shape,
      async ({ query, limit, skip, includeDescription }) => {
        return searchIssuesAdvanced(youtrackClient, { query, limit, skip, includeDescription });
      }
    );

    server.tool(
      "search-users-by-name",
      "Search users by name or login",
      searchUsersByNameSchema.shape,
      async ({ name, limit, exactMatch }) => {
        return searchUsersByName(youtrackClient, { name, limit, exactMatch });
      }
    );

    server.tool(
      "get-my-issues",
      "Get issues assigned to current user",
      getMyIssuesSchema.shape,
      async ({ state, project, limit }) => {
        return getMyIssues(youtrackClient, { state, project, limit });
      }
    );

    server.tool(
      "get-recent-issues",
      "Get recently updated issues",
      getRecentIssuesSchema.shape,
      async ({ project, days, limit }) => {
        return getRecentIssues(youtrackClient, { project, days, limit });
      }
    );

    // Register Time Tracking Tools
    server.tool(
      "get-work-items",
      "Get work items (time logs) for an issue",
      getWorkItemsSchema.shape,
      async ({ issueId }) => {
        return getWorkItems(youtrackClient, { issueId });
      }
    );

    server.tool(
      "create-work-item",
      "Create a work item (log time) for an issue",
      createWorkItemSchema.shape,
      async ({ issueId, duration, description, type, date }) => {
        return createWorkItem(youtrackClient, { issueId, duration, description, type, date });
      }
    );

    server.tool(
      "update-work-item",
      "Update an existing work item",
      updateWorkItemSchema.shape,
      async ({ issueId, workItemId, duration, description, type, date }) => {
        return updateWorkItem(youtrackClient, { issueId, workItemId, duration, description, type, date });
      }
    );

    server.tool(
      "delete-work-item",
      "Delete a work item",
      deleteWorkItemSchema.shape,
      async ({ issueId, workItemId }) => {
        return deleteWorkItem(youtrackClient, { issueId, workItemId });
      }
    );

    server.tool(
      "set-estimation",
      "Set or update time estimation for an issue",
      setEstimationSchema.shape,
      async ({ issueId, estimationMinutes }) => {
        return setEstimation(youtrackClient, { issueId, estimationMinutes });
      }
    );

    server.tool(
      "get-time-summary",
      "Get comprehensive time tracking summary for an issue",
      getTimeSummarySchema.shape,
      async ({ issueId }) => {
        return getTimeSummary(youtrackClient, { issueId });
      }
    );

    // Register Issue Links Tools
    server.tool(
      "get-issue-links",
      "Get issue links and dependencies for an issue",
      getIssueLinksSchema.shape,
      async ({ issueId }) => {
        return getIssueLinks(youtrackClient, { issueId });
      }
    );

    server.tool(
      "create-issue-link",
      "Create a link between two issues (dependency, relation, etc.)",
      createIssueLinkSchema.shape,
      async ({ issueId, targetIssue, linkType, direction }) => {
        return createIssueLink(youtrackClient, { issueId, targetIssue, linkType, direction });
      }
    );

    server.tool(
      "delete-issue-link",
      "Delete an issue link",
      deleteIssueLinkSchema.shape,
      async ({ issueId, linkId }) => {
        return deleteIssueLink(youtrackClient, { issueId, linkId });
      }
    );

    server.tool(
      "get-link-types",
      "Get available issue link types",
      getLinkTypesSchema.shape,
      async ({ projectId }) => {
        return getLinkTypes(youtrackClient, { projectId });
      }
    );

    // Register Subtask Management Tools
    server.tool(
      "create-subtask",
      "Create a new subtask and link it to a parent issue",
      createSubtaskSchema.shape,
      async ({ parentIssueId, summary, description, assignee, priority, type, estimationMinutes, storyPoints, customFields }) => {
        return createSubtask(youtrackClient, { parentIssueId, summary, description, assignee, priority, type, estimationMinutes, storyPoints, customFields });
      }
    );

    server.tool(
      "get-subtasks",
      "Get all subtasks of a parent issue",
      getSubtasksSchema.shape,
      async ({ parentIssueId, includeCompleted, includeDetails }) => {
        return getSubtasks(youtrackClient, { parentIssueId, includeCompleted, includeDetails });
      }
    );

    server.tool(
      "get-parent-issue",
      "Get the parent issue of a subtask",
      getParentIssueSchema.shape,
      async ({ subtaskIssueId }) => {
        return getParentIssue(youtrackClient, { subtaskIssueId });
      }
    );

    server.tool(
      "convert-to-subtask",
      "Convert an existing issue to a subtask of another issue",
      convertToSubtaskSchema.shape,
      async ({ issueId, parentIssueId }) => {
        return convertToSubtask(youtrackClient, { issueId, parentIssueId });
      }
    );

    server.tool(
      "create-multiple-subtasks",
      "Create multiple subtasks for a parent issue in one operation",
      createMultipleSubtasksSchema.shape,
      async ({ parentIssueId, subtasks }) => {
        return createMultipleSubtasks(youtrackClient, { parentIssueId, subtasks });
      }
    );

    // Register Story Points Tools
    server.tool(
      "set-story-points",
      "Set story points for an issue",
      setStoryPointsSchema.shape,
      async ({ issueId, storyPoints }) => {
        return setStoryPoints(youtrackClient, { issueId, storyPoints });
      }
    );

    server.tool(
      "get-story-points",
      "Get story points for an issue",
      getStoryPointsSchema.shape,
      async ({ issueId }) => {
        return getStoryPoints(youtrackClient, { issueId });
      }
    );

    // Register Gantt Chart Tools
    server.tool(
      "get-gantt-data",
      "Get Gantt chart data with filtering options for project timeline visualization",
      getGanttDataSchema.shape,
      async ({ projectIds, assigneeIds, startDate, endDate, includeCompleted, includeSubtasks, stateNames, priorityNames, typeNames, query }) => {
        return getGanttData(youtrackClient, { projectIds, assigneeIds, startDate, endDate, includeCompleted, includeSubtasks, stateNames, priorityNames, typeNames, query });
      }
    );

    server.tool(
      "export-gantt-chart",
      "Export Gantt chart data in various formats (JSON, CSV, Mermaid) for visualization tools",
      exportGanttChartSchema.shape,
      async ({ projectIds, format, includeSubtasks, includeDependencies, includeMilestones, dateFormat, timezone, assigneeIds, query }) => {
        return exportGanttChart(youtrackClient, { projectIds, format, includeSubtasks, includeDependencies, includeMilestones, dateFormat, timezone, assigneeIds, query });
      }
    );

    server.tool(
      "update-issue-timeline",
      "Update issue timeline information (start date, due date, estimation)",
      updateIssueTimelineSchema.shape,
      async ({ issueId, startDate, dueDate, estimation }) => {
        return updateIssueTimeline(youtrackClient, { issueId, startDate, dueDate, estimation });
      }
    );

    server.tool(
      "get-project-timeline",
      "Get comprehensive project timeline with tasks and milestones",
      getProjectTimelineSchema.shape,
      async ({ projectId, includeSubtasks, includeCompleted }) => {
        return getProjectTimeline(youtrackClient, { projectId, includeSubtasks, includeCompleted });
      }
    );

    server.tool(
      "calculate-critical-path",
      "Calculate critical path for project scheduling and identify bottlenecks",
      calculateCriticalPathSchema.shape,
      async ({ projectId }) => {
        return calculateCriticalPath(youtrackClient, { projectId });
      }
    );

    server.tool(
      "get-timeline-conflicts",
      "Detect and report timeline conflicts, dependency cycles, and resource overlaps",
      getTimelineConflictsSchema.shape,
      async ({ projectIds, assigneeIds }) => {
        return getTimelineConflicts(youtrackClient, { projectIds, assigneeIds });
      }
    );

    // Start the server
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error('🚀 Ougha.MCP.YouTrack is running');

  } catch (error) {
    console.error('Failed to start Ougha.MCP.YouTrack:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.error('\n👋 Shutting down Ougha.MCP.YouTrack...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down Ougha.MCP.YouTrack...');
  process.exit(0);
});

// Start the server
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
