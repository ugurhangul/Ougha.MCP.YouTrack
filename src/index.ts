#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getConfig, logConfigInfo } from './config.js';
import { YouTrackClient } from './youtrack-client.js';

// Import tool functions and schemas
// Import tool functions and schemas
import {
  createIssue, updateIssue, getIssue, searchIssues, addComment, deleteIssue,
  createIssueSchema, updateIssueSchema, getIssueSchema, searchIssuesSchema, addCommentSchema, deleteIssueSchema,
  buildCreateIssueSchema, buildUpdateIssueSchema 
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
  getSubtasksSchema, getParentIssueSchema, convertToSubtaskSchema,
  buildCreateSubtaskSchema, buildCreateMultipleSubtasksSchema
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

    // Fetch accessible custom fields for dynamic schema generation
    console.error('Fetching custom fields for dynamic schema generation...');
    const customFields = await youtrackClient.getAccessibleCustomFields();
    console.error(`✅ Found ${customFields.length} custom fields`);
    
    // Build dynamic schemas
    const dynamicCreateIssueSchema = buildCreateIssueSchema(customFields);
    const dynamicUpdateIssueSchema = buildUpdateIssueSchema(customFields);
    const dynamicCreateSubtaskSchema = buildCreateSubtaskSchema(customFields);
    const dynamicCreateMultipleSubtasksSchema = buildCreateMultipleSubtasksSchema(customFields);

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
      dynamicCreateIssueSchema.shape, // Use dynamic schema shape
      async (params: any) => {
        // Pass the params record and metadata directly to the function
        return createIssue(youtrackClient, params, customFields);
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
      dynamicUpdateIssueSchema.shape, // Use dynamic schema
      async (params: any) => {
        return updateIssue(youtrackClient, params, customFields);
      }
    );

// ... (search issues, etc.)

    // Register Subtask Management Tools
    server.tool(
      "create-subtask",
      "Create a new subtask and link it to a parent issue",
      dynamicCreateSubtaskSchema.shape, // Use dynamic schema
      async (params: any) => {
        return createSubtask(youtrackClient, params, customFields);
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
      dynamicCreateMultipleSubtasksSchema.shape,
      async (params: any) => {
        return createMultipleSubtasks(youtrackClient, params, customFields);
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
