import { z } from 'zod';
import { YouTrackClient } from '../youtrack-client.js';
import { CreateSubtaskRequest, CreateMultipleSubtasksRequest } from '../types.js';
import { formatApiError } from '../utils.js';

/**
 * MCP tools for YouTrack subtask management
 */

export const createSubtaskSchema = z.object({
  parentIssueId: z.string().describe('Parent issue ID (e.g., PROJECT-123)'),
  summary: z.string().describe('Subtask summary/title'),
  description: z.string().optional().describe('Subtask description'),
  assignee: z.string().optional().describe('Assignee user ID or login'),
  priority: z.string().optional().describe('Priority name'),
  type: z.string().optional().describe('Issue type name'),
  estimationMinutes: z.number().min(0).optional().describe('Initial time estimation in minutes'),
  storyPoints: z.number().min(0).optional().describe('Story points value (e.g., 1, 2, 3, 5, 8, 13, 21)'),
  customFields: z.record(z.any()).optional().describe('Custom field values as key-value pairs')
});

export const getSubtasksSchema = z.object({
  parentIssueId: z.string().describe('Parent issue ID (e.g., PROJECT-123)'),
  includeCompleted: z.boolean().default(false).describe('Include completed/resolved subtasks'),
  includeDetails: z.boolean().default(true).describe('Include detailed subtask information')
});

export const getParentIssueSchema = z.object({
  subtaskIssueId: z.string().describe('Subtask issue ID (e.g., PROJECT-456)')
});

export const convertToSubtaskSchema = z.object({
  issueId: z.string().describe('Issue ID to convert to subtask (e.g., PROJECT-456)'),
  parentIssueId: z.string().describe('Parent issue ID (e.g., PROJECT-123)')
});

export const createMultipleSubtasksSchema = z.object({
  parentIssueId: z.string().describe('Parent issue ID (e.g., PROJECT-123)'),
  subtasks: z.array(z.object({
    summary: z.string().describe('Subtask summary/title'),
    description: z.string().optional().describe('Subtask description'),
    assignee: z.string().optional().describe('Assignee user ID or login'),
    priority: z.string().optional().describe('Priority name'),
    type: z.string().optional().describe('Issue type name'),
    estimationMinutes: z.number().min(0).optional().describe('Initial time estimation in minutes'),
    storyPoints: z.number().min(0).optional().describe('Story points value'),
    customFields: z.record(z.any()).optional().describe('Custom field values as key-value pairs')
  })).min(1).max(20).describe('Array of subtasks to create (max 20)')
});

/**
 * Create a new subtask and link it to a parent issue
 */
export async function createSubtask(client: YouTrackClient, params: z.infer<typeof createSubtaskSchema>) {
  try {
    const subtaskRequest: CreateSubtaskRequest = {
      parentIssueId: params.parentIssueId,
      summary: params.summary,
      description: params.description,
      assignee: params.assignee,
      priority: params.priority,
      type: params.type,
      estimationMinutes: params.estimationMinutes,
      storyPoints: params.storyPoints,
      customFields: params.customFields
    };

    const result = await client.createSubtask(subtaskRequest);
    
    return {
      content: [
        {
          type: "text" as const,
          text: `Successfully created subtask ${result.subtask.idReadable}:\n\n` +
                `**Summary:** ${result.subtask.summary}\n` +
                `**Parent Issue:** ${params.parentIssueId}\n` +
                `**Project:** ${result.subtask.project.name} (${result.subtask.project.shortName})\n` +
                `**Assignee:** ${result.subtask.assignee?.fullName || 'Unassigned'}\n` +
                `**Created:** ${new Date(result.subtask.created).toLocaleString()}\n` +
                `**Link ID:** ${result.link.id}\n` +
                (result.subtask.description ? `\n**Description:**\n${result.subtask.description}` : '')
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to create subtask: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Get all subtasks of a parent issue
 */
export async function getSubtasks(client: YouTrackClient, params: z.infer<typeof getSubtasksSchema>) {
  try {
    const subtasks = await client.getSubtasks(params.parentIssueId, params.includeCompleted);
    
    if (subtasks.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No subtasks found for issue ${params.parentIssueId}.`
          }
        ]
      };
    }

    const subtasksText = subtasks.map(subtask => {
      const status = subtask.state?.isResolved ? '✅' : '🔄';
      const assignee = subtask.assignee ? ` (${subtask.assignee.fullName})` : ' (Unassigned)';
      const estimation = subtask.estimation ? ` | Est: ${subtask.estimation.presentation}` : '';
      const storyPoints = subtask.storyPoints ? ` | SP: ${subtask.storyPoints}` : '';
      
      let details = `${status} **${subtask.idReadable}** - ${subtask.summary}${assignee}`;
      if (params.includeDetails) {
        details += `\n  State: ${subtask.state?.name || 'Unknown'}${estimation}${storyPoints}`;
        if (subtask.description) {
          details += `\n  Description: ${subtask.description.substring(0, 100)}${subtask.description.length > 100 ? '...' : ''}`;
        }
      }
      return details;
    }).join('\n\n');

    const completedCount = subtasks.filter(s => s.state?.isResolved).length;
    const totalCount = subtasks.length;
    const progressText = `Progress: ${completedCount}/${totalCount} completed`;

    return {
      content: [
        {
          type: "text" as const,
          text: `**Subtasks for ${params.parentIssueId}:**\n\n${subtasksText}\n\n**${progressText}**`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to get subtasks: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Get the parent issue of a subtask
 */
export async function getParentIssue(client: YouTrackClient, params: z.infer<typeof getParentIssueSchema>) {
  try {
    const parent = await client.getParentIssue(params.subtaskIssueId);
    
    if (!parent) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Issue ${params.subtaskIssueId} is not a subtask or has no parent issue.`
          }
        ]
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `**Parent Issue of ${params.subtaskIssueId}:**\n\n` +
                `**ID:** ${parent.idReadable}\n` +
                `**Summary:** ${parent.summary}\n` +
                `**Project:** ${parent.project.name} (${parent.project.shortName})\n` +
                `**Assignee:** ${parent.assignee?.fullName || 'Unassigned'}\n` +
                `**State:** ${parent.customFields?.find(f => f.name === 'State')?.value?.name || 'Unknown'}\n` +
                `**Created:** ${new Date(parent.created).toLocaleString()}`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to get parent issue: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Convert an existing issue to a subtask of another issue
 */
export async function convertToSubtask(client: YouTrackClient, params: z.infer<typeof convertToSubtaskSchema>) {
  try {
    // First verify both issues exist
    await client.getIssue(params.parentIssueId);
    await client.getIssue(params.issueId);

    // Get available link types to find an appropriate subtask link type
    const linkTypes = await client.getLinkTypes();

    // Try to find subtask-related link types in order of preference
    const subtaskPatterns = [
      'subtask',        // Match "Subtask" first (most common)
      'subtask of',
      'parent for',
      'parent',
      'child of',
      'child',
      'sub-task',
      'sub task'
    ];

    let linkType: string | null = null;
    let direction: 'OUTWARD' | 'INWARD' = 'OUTWARD';

    for (const pattern of subtaskPatterns) {
      const foundLinkType = linkTypes.find(lt =>
        (lt.name && lt.name.toLowerCase().includes(pattern)) ||
        (lt.localizedName && lt.localizedName.toLowerCase().includes(pattern))
      );

      if (foundLinkType) {
        linkType = foundLinkType.localizedName || foundLinkType.name;

        // Determine the correct direction based on the link type name
        if (linkType.toLowerCase() === 'subtask') {
          // For the standard "Subtask" link type, parent links OUTWARD to subtask
          direction = 'OUTWARD';
        } else if (linkType.toLowerCase().includes('subtask of') ||
                   linkType.toLowerCase().includes('child of')) {
          // For "subtask of" links, parent should link OUTWARD to subtask
          direction = 'OUTWARD';
        } else if (linkType.toLowerCase().includes('parent for') ||
                   linkType.toLowerCase().includes('parent of')) {
          // For "parent for" links, parent should link OUTWARD to subtask
          direction = 'OUTWARD';
        }
        break;
      }
    }

    if (!linkType) {
      // Fallback to relationship types
      const relationshipPatterns = ['relates to', 'related to', 'relates', 'related'];

      for (const pattern of relationshipPatterns) {
        const foundLinkType = linkTypes.find(lt =>
          (lt.name && lt.name.toLowerCase().includes(pattern)) ||
          (lt.localizedName && lt.localizedName.toLowerCase().includes(pattern))
        );

        if (foundLinkType) {
          linkType = foundLinkType.localizedName || foundLinkType.name;
          direction = 'OUTWARD';
          break;
        }
      }
    }

    if (!linkType) {
      const availableTypes = linkTypes.map(lt => lt.localizedName || lt.name).join(', ');
      throw new Error(`No suitable subtask or relationship link type found. Available link types: ${availableTypes}`);
    }

    const link = await client.createIssueLink(params.parentIssueId, {
      linkType: linkType,
      targetIssue: params.issueId,
      direction: direction
    });

    return {
      content: [
        {
          type: "text" as const,
          text: `Successfully converted issue ${params.issueId} to a subtask of ${params.parentIssueId}:\n\n` +
                `**Link Type:** ${link.linkType.localizedName || link.linkType.name}\n` +
                `**Direction:** ${link.direction}\n` +
                `**Link ID:** ${link.id}\n\n` +
                `Issue ${params.issueId} is now a subtask of ${params.parentIssueId}.`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to convert to subtask: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Create multiple subtasks for a parent issue
 */
export async function createMultipleSubtasks(client: YouTrackClient, params: z.infer<typeof createMultipleSubtasksSchema>) {
  try {
    const request: CreateMultipleSubtasksRequest = {
      parentIssueId: params.parentIssueId,
      subtasks: params.subtasks
    };

    const results = await client.createMultipleSubtasks(request);
    
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;
    
    const successfulSubtasks = results
      .filter(r => r.success)
      .map(r => `✅ **${r.subtask!.idReadable}** - ${r.subtask!.summary}`)
      .join('\n');
    
    const failedSubtasks = results
      .filter(r => !r.success)
      .map(r => `❌ ${r.summary} - ${r.error}`)
      .join('\n');

    let responseText = `**Created ${successCount} of ${results.length} subtasks for ${params.parentIssueId}:**\n\n`;
    
    if (successfulSubtasks) {
      responseText += `**Successful:**\n${successfulSubtasks}\n\n`;
    }
    
    if (failedSubtasks) {
      responseText += `**Failed:**\n${failedSubtasks}`;
    }

    return {
      content: [
        {
          type: "text" as const,
          text: responseText
        }
      ],
      isError: failureCount > 0
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to create multiple subtasks: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}
