import { z } from 'zod';
import { YouTrackClient } from '../youtrack-client.js';
import { formatApiError } from '../utils.js';

/**
 * MCP tools for YouTrack story points management
 */

export const setStoryPointsSchema = z.object({
  issueId: z.string().describe('Issue ID (e.g., PROJECT-123)'),
  storyPoints: z.number().min(0).describe('Story points value (e.g., 1, 2, 3, 5, 8, 13, 21)')
});

export const getStoryPointsSchema = z.object({
  issueId: z.string().describe('Issue ID (e.g., PROJECT-123)')
});

/**
 * Set story points for an issue
 */
export async function setStoryPoints(client: YouTrackClient, params: z.infer<typeof setStoryPointsSchema>) {
  try {
    const issue = await client.setStoryPoints(params.issueId, params.storyPoints);
    
    return {
      content: [
        {
          type: "text" as const,
          text: `Successfully set story points for issue ${issue.idReadable}:\n\n` +
                `**Issue:** ${issue.idReadable} - ${issue.summary}\n` +
                `**Story Points:** ${params.storyPoints}\n` +
                `**Project:** ${issue.project.name} (${issue.project.shortName})\n` +
                `**Assignee:** ${issue.assignee?.fullName || 'Unassigned'}`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to set story points: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Get story points for an issue
 */
export async function getStoryPoints(client: YouTrackClient, params: z.infer<typeof getStoryPointsSchema>) {
  try {
    const storyPoints = await client.getStoryPoints(params.issueId);
    
    if (storyPoints === null) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No story points set for issue ${params.issueId}.`
          }
        ]
      };
    }

    // Get issue details for context
    const issue = await client.getIssue(params.issueId);
    
    return {
      content: [
        {
          type: "text" as const,
          text: `**Story Points for ${issue.idReadable}:**\n\n` +
                `**Issue:** ${issue.idReadable} - ${issue.summary}\n` +
                `**Story Points:** ${storyPoints}\n` +
                `**Project:** ${issue.project.name} (${issue.project.shortName})\n` +
                `**Assignee:** ${issue.assignee?.fullName || 'Unassigned'}`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to get story points: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}
