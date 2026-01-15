import { z } from 'zod';
import { YouTrackClient } from '../youtrack-client.js';
import { CreateIssueRequest, UpdateIssueRequest, SearchIssuesRequest } from '../types.js';
import { formatDate, formatCustomFieldValue, formatApiError, delay } from '../utils.js';

/**
 * MCP tools for YouTrack issue management
 */

export const createIssueSchema = z.object({
  project: z.string().describe('Project ID or short name'),
  summary: z.string().describe('Issue summary/title'),
  description: z.string().optional().describe('Issue description'),
  assignee: z.string().optional().describe('Assignee user ID or login'),
  priority: z.string().optional().describe('Priority name'),
  type: z.string().optional().describe('Issue type name'),
  estimationMinutes: z.number().min(0).optional().describe('Initial time estimation in minutes'),
  storyPoints: z.number().min(0).optional().describe('Story points value (e.g., 1, 2, 3, 5, 8, 13, 21)'),
  customFields: z.record(z.any()).optional().describe('Custom field values as key-value pairs'),
  parentIssue: z.string().optional().describe('Parent issue ID to create this as a subtask (e.g., PROJECT-123)')
});

export const updateIssueSchema = z.object({
  issueId: z.string().describe('Issue ID (e.g., PROJECT-123)'),
  summary: z.string().optional().describe('New issue summary/title'),
  description: z.string().optional().describe('New issue description'),
  assignee: z.string().optional().describe('New assignee user ID or login'),
  state: z.string().optional().describe('New state name'),
  priority: z.string().optional().describe('New priority name'),
  estimationMinutes: z.number().min(0).optional().describe('New time estimation in minutes'),
  storyPoints: z.number().min(0).optional().describe('Story points value (e.g., 1, 2, 3, 5, 8, 13, 21)'),
  customFields: z.record(z.any()).optional().describe('Custom field values to update')
});

export const getIssueSchema = z.object({
  issueId: z.string().describe('Issue ID (e.g., PROJECT-123)')
});

export const searchIssuesSchema = z.object({
  query: z.string().optional().describe('YouTrack search query (e.g., "assignee: me", "project: MyProject")'),
  project: z.string().optional().describe('Filter by project ID or short name'),
  assignee: z.string().optional().describe('Filter by assignee user ID or login'),
  state: z.string().optional().describe('Filter by state name'),
  limit: z.number().min(1).max(100).default(20).describe('Maximum number of issues to return'),
  skip: z.number().min(0).default(0).describe('Number of issues to skip for pagination')
});

export const addCommentSchema = z.object({
  issueId: z.string().describe('Issue ID (e.g., PROJECT-123)'),
  text: z.string().describe('Comment text')
});

export const deleteIssueSchema = z.object({
  issueId: z.string().describe('Issue ID (e.g., PROJECT-123) - WARNING: This operation cannot be undone!')
});

/**
 * Create a new issue
 */
export async function createIssue(client: YouTrackClient, params: z.infer<typeof createIssueSchema>) {
  try {
    // Prepare custom fields including estimation and story points if provided
    let customFields = params.customFields || {};

    if (params.estimationMinutes !== undefined) {
      customFields['Estimation'] = {
        minutes: params.estimationMinutes,
        $type: 'PeriodIssueCustomField'
      };
    }

    if (params.storyPoints !== undefined) {
      customFields['Story Points'] = {
        value: params.storyPoints,
        $type: 'SimpleIssueCustomField'
      };
    }

    const createRequest: CreateIssueRequest = {
      project: params.project,
      summary: params.summary,
      description: params.description,
      assignee: params.assignee,
      priority: params.priority,
      type: params.type,
      customFields: Object.keys(customFields).length > 0 ? customFields : undefined
    };

    const issue = await client.createIssue(createRequest);

    // If parentIssue is specified, create a subtask relationship
    let linkInfo = '';
    if (params.parentIssue) {
      try {
        const link = await client.createIssueLink(issue.idReadable, {
          linkType: 'Subtask of',
          targetIssue: params.parentIssue,
          direction: 'OUTWARD'
        });
        linkInfo = `\n**Parent Issue:** ${params.parentIssue}\n**Link ID:** ${link.id}`;
      } catch (linkError: any) {
        // Issue was created but linking failed - report both
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ Successfully created issue ${issue.idReadable}, but failed to link as subtask:\n\n` +
                    `**Summary:** ${issue.summary}\n` +
                    `**Project:** ${issue.project.name} (${issue.project.shortName})\n` +
                    `**Reporter:** ${issue.reporter?.fullName || 'Unknown'}\n` +
                    `**Assignee:** ${issue.assignee?.fullName || 'Unassigned'}\n` +
                    `**Created:** ${new Date(issue.created).toLocaleString()}\n\n` +
                    `❌ **Subtask Link Failed:** ${linkError.message}\n` +
                    `You can manually create the subtask relationship using the create-issue-link tool.`
            }
          ],
          isError: true
        };
      }
    }

    const issueType = params.parentIssue ? 'subtask' : 'issue';

    return {
      content: [
        {
          type: "text" as const,
          text: `Successfully created ${issueType} ${issue.idReadable}:\n\n` +
                `**Summary:** ${issue.summary}\n` +
                `**Project:** ${issue.project.name} (${issue.project.shortName})\n` +
                `**Reporter:** ${issue.reporter?.fullName || 'Unknown'}\n` +
                `**Assignee:** ${issue.assignee?.fullName || 'Unassigned'}\n` +
                `**Created:** ${new Date(issue.created).toLocaleString()}${linkInfo}\n` +
                (issue.description ? `\n**Description:**\n${issue.description}` : '')
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to create issue: ${error.message}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Get issue by ID
 */
export async function getIssue(client: YouTrackClient, params: z.infer<typeof getIssueSchema>) {
  try {
    const issue = await client.getIssue(params.issueId);
    
    let customFieldsText = '';
    if (issue.customFields && issue.customFields.length > 0) {
      customFieldsText = '\n**Custom Fields:**\n' +
        issue.customFields.map(field => `- ${field.name}: ${formatCustomFieldValue(field)}`).join('\n');
    }

    let tagsText = '';
    if (issue.tags && issue.tags.length > 0) {
      tagsText = '\n**Tags:** ' + issue.tags.map(tag => tag.name).join(', ');
    }

    let commentsText = '';
    if (issue.comments && issue.comments.length > 0) {
      commentsText = '\n\n**Recent Comments:**\n' +
        issue.comments.slice(-3).map(comment => 
          `- ${comment.author.fullName} (${new Date(comment.created).toLocaleString()}): ${comment.text}`
        ).join('\n');
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `**Issue ${issue.idReadable}**\n\n` +
                `**Summary:** ${issue.summary}\n` +
                `**Project:** ${issue.project.name} (${issue.project.shortName})\n` +
                `**Reporter:** ${issue.reporter?.fullName || 'Unknown'}\n` +
                `**Assignee:** ${issue.assignee?.fullName || 'Unassigned'}\n` +
                `**Created:** ${formatDate(issue.created)}\n` +
                `**Updated:** ${formatDate(issue.updated)}\n` +
                (issue.resolved ? `**Resolved:** ${formatDate(issue.resolved)}\n` : '') +
                (issue.description ? `\n**Description:**\n${issue.description}\n` : '') +
                customFieldsText +
                tagsText +
                commentsText
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to get issue: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Update an existing issue
 */
export async function updateIssue(client: YouTrackClient, params: z.infer<typeof updateIssueSchema>) {
  try {
    // Prepare custom fields including estimation and story points if provided
    let customFields = params.customFields || {};

    if (params.estimationMinutes !== undefined) {
      customFields['Estimation'] = {
        minutes: params.estimationMinutes,
        $type: 'PeriodIssueCustomField'
      };
    }

    if (params.storyPoints !== undefined) {
      customFields['Story Points'] = {
        value: params.storyPoints,
        $type: 'SimpleIssueCustomField'
      };
    }

    const updateRequest: UpdateIssueRequest = {
      summary: params.summary,
      description: params.description,
      assignee: params.assignee,
      state: params.state,
      priority: params.priority,
      customFields: Object.keys(customFields).length > 0 ? customFields : undefined
    };

    const issue = await client.updateIssue(params.issueId, updateRequest);

    // Add small delay to handle API eventual consistency
    await delay(500);

    return {
      content: [
        {
          type: "text" as const,
          text: `Successfully updated issue ${issue.idReadable}:\n\n` +
                `**Summary:** ${issue.summary}\n` +
                `**Project:** ${issue.project.name} (${issue.project.shortName})\n` +
                `**Assignee:** ${issue.assignee?.fullName || 'Unassigned'}\n` +
                `**Updated:** ${formatDate(issue.updated)}\n\n` +
                `*Note: Changes may take a moment to appear in search results.*`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to update issue: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Search issues
 */
export async function searchIssues(client: YouTrackClient, params: z.infer<typeof searchIssuesSchema>) {
  try {
    const searchRequest: SearchIssuesRequest = {
      query: params.query,
      project: params.project,
      assignee: params.assignee,
      state: params.state,
      limit: params.limit,
      skip: params.skip
    };

    const result = await client.searchIssues(searchRequest);
    
    if (result.items.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No issues found matching the search criteria."
          }
        ]
      };
    }

    const issuesText = result.items.map(issue => {
      // Extract story points from custom fields if available
      let storyPointsText = '';
      if (issue.customFields) {
        const storyPointsField = issue.customFields.find(field => field.name === 'Story Points');
        if (storyPointsField && storyPointsField.value) {
          storyPointsText = `\n  Story Points: ${storyPointsField.value}`;
        }
      }

      return `**${issue.idReadable}** - ${issue.summary}\n` +
             `  Project: ${issue.project.shortName}\n` +
             `  Assignee: ${issue.assignee?.fullName || 'Unassigned'}\n` +
             `  Updated: ${new Date(issue.updated).toLocaleString()}` +
             storyPointsText;
    }).join('\n\n');

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${result.items.length} issue(s)${result.hasMore ? ' (more available)' : ''}:\n\n${issuesText}`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to search issues: ${error.message}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Add comment to an issue
 */
export async function addComment(client: YouTrackClient, params: z.infer<typeof addCommentSchema>) {
  try {
    await client.addComment(params.issueId, params.text);

    return {
      content: [
        {
          type: "text" as const,
          text: `Successfully added comment to issue ${params.issueId}`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to add comment: ${error.message}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Delete an issue
 * WARNING: This operation cannot be undone!
 */
export async function deleteIssue(client: YouTrackClient, params: z.infer<typeof deleteIssueSchema>) {
  try {
    await client.deleteIssue(params.issueId);

    return {
      content: [
        {
          type: "text" as const,
          text: `⚠️ **ISSUE DELETED** ⚠️\n\n` +
                `Issue ${params.issueId} has been permanently deleted from YouTrack.\n\n` +
                `**This action cannot be undone!**\n\n` +
                `All associated data including comments, attachments, time tracking, and links have been removed.`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to delete issue: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}
