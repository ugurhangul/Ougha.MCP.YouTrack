import { z } from 'zod';
import { YouTrackClient } from '../youtrack-client.js';
import { formatApiError } from '../utils.js';

/**
 * MCP tools for YouTrack user management
 */

export const getUserSchema = z.object({
  userId: z.string().describe('User ID or login')
});

export const listUsersSchema = z.object({
  query: z.string().optional().describe('Search query to filter users by name or login'),
  limit: z.number().min(1).max(100).default(50).describe('Maximum number of users to return'),
  includeBanned: z.boolean().default(false).describe('Include banned users in the results')
});

export const getCurrentUserSchema = z.object({});

/**
 * Get current user information
 */
export async function getCurrentUser(client: YouTrackClient, params: z.infer<typeof getCurrentUserSchema>) {
  try {
    const user = await client.getCurrentUser();
    
    const onlineStatus = user.online ? 'Online' : 'Offline';
    const bannedStatus = user.banned ? ' (Banned)' : '';
    const email = user.email ? `**Email:** ${user.email}\n` : '';
    const avatar = user.avatarUrl ? `**Avatar:** ${user.avatarUrl}\n` : '';

    return {
      content: [
        {
          type: "text" as const,
          text: `**Current User Information**\n\n` +
                `**Name:** ${user.fullName}${bannedStatus}\n` +
                `**Login:** ${user.login}\n` +
                `**ID:** ${user.id}\n` +
                email +
                `**Status:** ${onlineStatus}\n` +
                avatar
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to get current user: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}

/**
 * List users
 */
export async function listUsers(client: YouTrackClient, params: z.infer<typeof listUsersSchema>) {
  try {
    const users = await client.getUsers(params.query, params.limit);
    
    // Filter out banned users if not requested
    const filteredUsers = params.includeBanned 
      ? users 
      : users.filter(user => !user.banned);

    if (filteredUsers.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No users found matching the criteria."
          }
        ]
      };
    }

    const usersText = filteredUsers.map(user => {
      const onlineStatus = user.online ? '🟢' : '🔴';
      const bannedStatus = user.banned ? ' (Banned)' : '';
      const email = user.email ? ` | ${user.email}` : '';
      
      return `${onlineStatus} **${user.fullName}** (${user.login})${bannedStatus}${email}`;
    }).join('\n');

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${filteredUsers.length} user(s):\n\n${usersText}`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to list users: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Get user details by ID or login
 */
export async function getUser(client: YouTrackClient, params: z.infer<typeof getUserSchema>) {
  try {
    const user = await client.getUser(params.userId);
    
    const onlineStatus = user.online ? 'Online' : 'Offline';
    const bannedStatus = user.banned ? ' (Banned)' : '';
    const email = user.email ? `**Email:** ${user.email}\n` : '';
    const avatar = user.avatarUrl ? `**Avatar:** ${user.avatarUrl}\n` : '';

    return {
      content: [
        {
          type: "text" as const,
          text: `**User Information**\n\n` +
                `**Name:** ${user.fullName}${bannedStatus}\n` +
                `**Login:** ${user.login}\n` +
                `**ID:** ${user.id}\n` +
                email +
                `**Status:** ${onlineStatus}\n` +
                avatar
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to get user: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}
