import { z } from 'zod';
import { YouTrackClient } from '../youtrack-client.js';
import { CreateWorkItemRequest, UpdateWorkItemRequest } from '../types.js';
import { formatDate, formatApiError, delay } from '../utils.js';

/**
 * MCP tools for YouTrack time tracking and work item management
 */

export const getWorkItemsSchema = z.object({
  issueId: z.string().describe('Issue ID (e.g., PROJECT-123)')
});

export const createWorkItemSchema = z.object({
  issueId: z.string().describe('Issue ID (e.g., PROJECT-123)'),
  duration: z.number().min(1).describe('Duration in minutes'),
  description: z.string().optional().describe('Work item description'),
  type: z.string().optional().describe('Work item type name'),
  date: z.number().optional().describe('Work date as Unix timestamp (defaults to current time)')
});

export const updateWorkItemSchema = z.object({
  issueId: z.string().describe('Issue ID (e.g., PROJECT-123)'),
  workItemId: z.string().describe('Work item ID'),
  duration: z.number().min(1).optional().describe('New duration in minutes'),
  description: z.string().optional().describe('New work item description'),
  type: z.string().optional().describe('New work item type name'),
  date: z.number().optional().describe('New work date as Unix timestamp')
});

export const deleteWorkItemSchema = z.object({
  issueId: z.string().describe('Issue ID (e.g., PROJECT-123)'),
  workItemId: z.string().describe('Work item ID to delete')
});

export const setEstimationSchema = z.object({
  issueId: z.string().describe('Issue ID (e.g., PROJECT-123)'),
  estimationMinutes: z.number().min(0).describe('Estimation in minutes')
});

export const getTimeSummarySchema = z.object({
  issueId: z.string().describe('Issue ID (e.g., PROJECT-123)')
});

/**
 * Get work items for an issue
 */
export async function getWorkItems(client: YouTrackClient, params: z.infer<typeof getWorkItemsSchema>) {
  try {
    const workItems = await client.getWorkItems(params.issueId);
    
    if (workItems.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No work items found for issue ${params.issueId}.`
          }
        ]
      };
    }

    const workItemsText = workItems.map(item => 
      `**Work Item ${item.id}**\n` +
      `  Author: ${item.author.fullName}\n` +
      `  Duration: ${item.duration.presentation}\n` +
      `  Date: ${formatDate(item.date)}\n` +
      (item.description ? `  Description: ${item.description}\n` : '') +
      (item.type ? `  Type: ${item.type.name}\n` : '') +
      `  Created: ${formatDate(item.created)}`
    ).join('\n\n');

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${workItems.length} work item(s) for issue ${params.issueId}:\n\n${workItemsText}`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to get work items: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Create a work item (log time)
 */
export async function createWorkItem(client: YouTrackClient, params: z.infer<typeof createWorkItemSchema>) {
  try {
    const createRequest: CreateWorkItemRequest = {
      duration: params.duration,
      description: params.description,
      type: params.type,
      date: params.date
    };

    const workItem = await client.createWorkItem(params.issueId, createRequest);

    // Add small delay to handle API eventual consistency
    await delay(500);

    return {
      content: [
        {
          type: "text" as const,
          text: `Successfully created work item for issue ${params.issueId}:\n\n` +
                `**Work Item ID:** ${workItem.id}\n` +
                `**Duration:** ${workItem.duration.presentation}\n` +
                `**Date:** ${formatDate(workItem.date)}\n` +
                `**Author:** ${workItem.author.fullName}\n` +
                (workItem.description ? `**Description:** ${workItem.description}\n` : '') +
                (workItem.type ? `**Type:** ${workItem.type.name}\n` : '') +
                `**Created:** ${formatDate(workItem.created)}`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to create work item: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Update a work item
 */
export async function updateWorkItem(client: YouTrackClient, params: z.infer<typeof updateWorkItemSchema>) {
  try {
    const updateRequest: UpdateWorkItemRequest = {
      duration: params.duration,
      description: params.description,
      type: params.type,
      date: params.date
    };

    const workItem = await client.updateWorkItem(params.issueId, params.workItemId, updateRequest);

    // Add small delay to handle API eventual consistency
    await delay(500);

    return {
      content: [
        {
          type: "text" as const,
          text: `Successfully updated work item ${params.workItemId} for issue ${params.issueId}:\n\n` +
                `**Duration:** ${workItem.duration.presentation}\n` +
                `**Date:** ${formatDate(workItem.date)}\n` +
                `**Author:** ${workItem.author.fullName}\n` +
                (workItem.description ? `**Description:** ${workItem.description}\n` : '') +
                (workItem.type ? `**Type:** ${workItem.type.name}\n` : '') +
                `**Updated:** ${formatDate(workItem.updated || workItem.created)}`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to update work item: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Delete a work item
 */
export async function deleteWorkItem(client: YouTrackClient, params: z.infer<typeof deleteWorkItemSchema>) {
  try {
    await client.deleteWorkItem(params.issueId, params.workItemId);

    // Add small delay to handle API eventual consistency
    await delay(500);

    return {
      content: [
        {
          type: "text" as const,
          text: `Successfully deleted work item ${params.workItemId} from issue ${params.issueId}`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to delete work item: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Set estimation for an issue
 */
export async function setEstimation(client: YouTrackClient, params: z.infer<typeof setEstimationSchema>) {
  try {
    const issue = await client.setEstimation(params.issueId, params.estimationMinutes);

    // Add small delay to handle API eventual consistency
    await delay(500);

    // Format estimation for display
    const hours = Math.floor(params.estimationMinutes / 60);
    const minutes = params.estimationMinutes % 60;
    const estimationText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    return {
      content: [
        {
          type: "text" as const,
          text: `Successfully set estimation for issue ${issue.idReadable}:\n\n` +
                `**Estimation:** ${estimationText}\n` +
                `**Issue:** ${issue.summary}\n` +
                `**Updated:** ${formatDate(issue.updated)}`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to set estimation: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Get time tracking summary for an issue
 */
export async function getTimeSummary(client: YouTrackClient, params: z.infer<typeof getTimeSummarySchema>) {
  try {
    const summary = await client.getTimeTrackingSummary(params.issueId);

    let summaryText = `**Time Tracking Summary for Issue ${params.issueId}**\n\n`;

    if (summary.estimation) {
      summaryText += `**Estimation:** ${summary.estimation.presentation}\n`;
    } else {
      summaryText += `**Estimation:** Not set\n`;
    }

    if (summary.spentTime) {
      summaryText += `**Spent Time:** ${summary.spentTime.presentation}\n`;
    } else {
      summaryText += `**Spent Time:** 0m\n`;
    }

    summaryText += `**Work Items:** ${summary.workItems.length}\n\n`;

    if (summary.workItems.length > 0) {
      summaryText += `**Recent Work Items:**\n`;
      const recentItems = summary.workItems
        .sort((a, b) => b.date - a.date)
        .slice(0, 5);

      summaryText += recentItems.map(item => 
        `• ${item.duration.presentation} - ${formatDate(item.date)} by ${item.author.fullName}` +
        (item.description ? ` (${item.description})` : '')
      ).join('\n');

      if (summary.workItems.length > 5) {
        summaryText += `\n... and ${summary.workItems.length - 5} more work items`;
      }
    }

    return {
      content: [
        {
          type: "text" as const,
          text: summaryText
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to get time summary: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}
