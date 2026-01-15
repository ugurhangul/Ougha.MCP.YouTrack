import { z } from 'zod';
import { YouTrackClient } from '../youtrack-client.js';
import { SearchIssuesRequest } from '../types.js';
import { formatDate, createDateRangeQuery, formatApiError } from '../utils.js';

/**
 * MCP tools for YouTrack search functionality
 */

export const searchIssuesAdvancedSchema = z.object({
  query: z.string().describe('YouTrack search query using YouTrack query language (e.g., "assignee: me State: Open", "project: MyProject created: today")'),
  limit: z.number().min(1).max(100).default(20).describe('Maximum number of issues to return'),
  skip: z.number().min(0).default(0).describe('Number of issues to skip for pagination'),
  includeDescription: z.boolean().default(false).describe('Include issue descriptions in results')
});

export const searchUsersByNameSchema = z.object({
  name: z.string().describe('Name or login to search for'),
  limit: z.number().min(1).max(100).default(20).describe('Maximum number of users to return'),
  exactMatch: z.boolean().default(false).describe('Whether to search for exact matches only')
});

export const getMyIssuesSchema = z.object({
  state: z.string().optional().describe('Filter by state (e.g., "Open", "In Progress", "Fixed")'),
  project: z.string().optional().describe('Filter by project short name'),
  limit: z.number().min(1).max(100).default(20).describe('Maximum number of issues to return')
});

export const getRecentIssuesSchema = z.object({
  project: z.string().optional().describe('Filter by project short name'),
  days: z.number().min(1).max(365).default(7).describe('Number of days to look back'),
  limit: z.number().min(1).max(100).default(20).describe('Maximum number of issues to return')
});

/**
 * Advanced issue search using YouTrack query language
 */
export async function searchIssuesAdvanced(client: YouTrackClient, params: z.infer<typeof searchIssuesAdvancedSchema>) {
  try {
    const searchRequest: SearchIssuesRequest = {
      query: params.query,
      limit: params.limit,
      skip: params.skip
    };

    const result = await client.searchIssues(searchRequest);
    
    if (result.items.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No issues found for query: "${params.query}"`
          }
        ]
      };
    }

    const issuesText = result.items.map(issue => {
      let text = `**${issue.idReadable}** - ${issue.summary}\n` +
                 `  Project: ${issue.project.name} (${issue.project.shortName})\n` +
                 `  Assignee: ${issue.assignee?.fullName || 'Unassigned'}\n` +
                 `  Reporter: ${issue.reporter?.fullName || 'Unknown'}\n` +
                 `  Updated: ${new Date(issue.updated).toLocaleString()}`;
      
      if (params.includeDescription && issue.description) {
        const truncatedDesc = issue.description.length > 200 
          ? issue.description.substring(0, 200) + '...' 
          : issue.description;
        text += `\n  Description: ${truncatedDesc}`;
      }
      
      return text;
    }).join('\n\n');

    const paginationInfo = result.hasMore ? `\n\n*Showing ${result.items.length} results (more available)*` : '';

    return {
      content: [
        {
          type: "text" as const,
          text: `**Search Results for:** "${params.query}"\n\n${issuesText}${paginationInfo}`
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
 * Search users by name or login
 */
export async function searchUsersByName(client: YouTrackClient, params: z.infer<typeof searchUsersByNameSchema>) {
  try {
    const searchQuery = params.exactMatch ? params.name : `*${params.name}*`;
    const users = await client.getUsers(searchQuery, params.limit);
    
    if (users.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No users found matching: "${params.name}"`
          }
        ]
      };
    }

    const usersText = users.map(user => {
      const onlineStatus = user.online ? '🟢' : '🔴';
      const bannedStatus = user.banned ? ' (Banned)' : '';
      const email = user.email ? ` | ${user.email}` : '';
      
      return `${onlineStatus} **${user.fullName}** (${user.login})${bannedStatus}${email}`;
    }).join('\n');

    return {
      content: [
        {
          type: "text" as const,
          text: `**Users matching "${params.name}":**\n\n${usersText}`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to search users: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Get issues assigned to current user
 */
export async function getMyIssues(client: YouTrackClient, params: z.infer<typeof getMyIssuesSchema>) {
  try {
    let query = 'assignee: me';
    
    if (params.state) {
      query += ` State: "${params.state}"`;
    }
    
    if (params.project) {
      query += ` project: ${params.project}`;
    }

    const searchRequest: SearchIssuesRequest = {
      query,
      limit: params.limit
    };

    const result = await client.searchIssues(searchRequest);
    
    if (result.items.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No issues assigned to you match the specified criteria."
          }
        ]
      };
    }

    const issuesText = result.items.map(issue =>
      `**${issue.idReadable}** - ${issue.summary}\n` +
      `  Project: ${issue.project.shortName}\n` +
      `  Updated: ${formatDate(issue.updated)}`
    ).join('\n\n');

    return {
      content: [
        {
          type: "text" as const,
          text: `**Your Issues:**\n\n${issuesText}`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to get your issues: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Get recently updated issues
 */
export async function getRecentIssues(client: YouTrackClient, params: z.infer<typeof getRecentIssuesSchema>) {
  try {
    let query = createDateRangeQuery(params.days);

    if (params.project) {
      query += ` project: ${params.project}`;
    }

    const searchRequest: SearchIssuesRequest = {
      query,
      limit: params.limit
    };

    const result = await client.searchIssues(searchRequest);
    
    if (result.items.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No issues updated in the last ${params.days} day(s).`
          }
        ]
      };
    }

    const issuesText = result.items.map(issue =>
      `**${issue.idReadable}** - ${issue.summary}\n` +
      `  Project: ${issue.project.shortName}\n` +
      `  Assignee: ${issue.assignee?.fullName || 'Unassigned'}\n` +
      `  Updated: ${formatDate(issue.updated)}`
    ).join('\n\n');

    return {
      content: [
        {
          type: "text" as const,
          text: `**Recently Updated Issues (last ${params.days} day(s)):**\n\n${issuesText}`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to get recent issues: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}
