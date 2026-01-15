import { z } from 'zod';
import { YouTrackClient } from '../youtrack-client.js';
import { CreateIssueLinkRequest } from '../types.js';
import { formatApiError } from '../utils.js';

/**
 * MCP tools for YouTrack issue links and dependencies management
 */

export const getIssueLinksSchema = z.object({
  issueId: z.string().describe('Issue ID (e.g., PROJECT-123)')
});

export const createIssueLinkSchema = z.object({
  issueId: z.string().describe('Source issue ID (e.g., PROJECT-123)'),
  targetIssue: z.string().describe('Target issue ID (e.g., PROJECT-456)'),
  linkType: z.string().describe('Link type name (e.g., "Depends on", "Blocks", "Relates to", "Parent for", "Subtask of")'),
  direction: z.enum(['OUTWARD', 'INWARD']).default('OUTWARD').describe('Direction of the link (OUTWARD: source -> target, INWARD: target -> source)')
});

export const deleteIssueLinkSchema = z.object({
  issueId: z.string().describe('Issue ID (e.g., PROJECT-123)'),
  linkId: z.string().describe('Link ID to delete')
});

export const getLinkTypesSchema = z.object({
  projectId: z.string().optional().describe('Project ID or short name (optional, if not provided returns global link types)')
});

/**
 * Get issue links for an issue
 */
export async function getIssueLinks(client: YouTrackClient, params: z.infer<typeof getIssueLinksSchema>) {
  try {
    const links = await client.getIssueLinks(params.issueId);
    
    if (links.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No links found for issue ${params.issueId}.`
          }
        ]
      };
    }

    const linksText = links.map(link => {
      const linkTypeName = link.linkType.localizedName || link.linkType.name;
      const direction = link.direction;
      const directionText = direction === 'OUTWARD' ? link.linkType.sourceToTarget : link.linkType.targetToSource;
      
      const linkedIssues = link.issues.map(issue => 
        `${issue.idReadable} - ${issue.summary}`
      ).join(', ');

      return `**${linkTypeName}** (${directionText})\n` +
             `  Direction: ${direction}\n` +
             `  Linked Issues: ${linkedIssues}\n` +
             `  Link ID: ${link.id}`;
    }).join('\n\n');

    return {
      content: [
        {
          type: "text" as const,
          text: `**Issue Links for ${params.issueId}:**\n\n${linksText}`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to get issue links: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Create an issue link
 */
export async function createIssueLink(client: YouTrackClient, params: z.infer<typeof createIssueLinkSchema>) {
  try {
    const linkRequest: CreateIssueLinkRequest = {
      linkType: params.linkType,
      targetIssue: params.targetIssue,
      direction: params.direction
    };

    const link = await client.createIssueLink(params.issueId, linkRequest);
    
    const linkTypeName = link.linkType.localizedName || link.linkType.name;
    const directionText = link.direction === 'OUTWARD' ? link.linkType.sourceToTarget : link.linkType.targetToSource;
    
    const linkedIssues = link.issues.map(issue => 
      `${issue.idReadable} - ${issue.summary}`
    ).join(', ');

    return {
      content: [
        {
          type: "text" as const,
          text: `Successfully created issue link:\n\n` +
                `**Link Type:** ${linkTypeName} (${directionText})\n` +
                `**Source Issue:** ${params.issueId}\n` +
                `**Target Issue:** ${params.targetIssue}\n` +
                `**Direction:** ${link.direction}\n` +
                `**Linked Issues:** ${linkedIssues}\n` +
                `**Link ID:** ${link.id}`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to create issue link: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Delete an issue link
 */
export async function deleteIssueLink(client: YouTrackClient, params: z.infer<typeof deleteIssueLinkSchema>) {
  try {
    await client.deleteIssueLink(params.issueId, params.linkId);
    
    return {
      content: [
        {
          type: "text" as const,
          text: `Successfully deleted issue link ${params.linkId} from issue ${params.issueId}.`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to delete issue link: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Get available link types
 */
export async function getLinkTypes(client: YouTrackClient, params: z.infer<typeof getLinkTypesSchema>) {
  try {
    const linkTypes = await client.getLinkTypes(params.projectId);

    if (linkTypes.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No link types found."
          }
        ]
      };
    }

    const linkTypesText = linkTypes.map(linkType => {
      const name = linkType.localizedName || linkType.name;
      const directed = linkType.directed ? 'Directed' : 'Undirected';
      const aggregation = linkType.aggregation ? 'Aggregation' : 'Regular';
      const readOnly = linkType.readOnly ? ' (Read-only)' : '';

      // Highlight subtask-related link types
      const isSubtaskRelated = name.toLowerCase().includes('subtask') ||
                               name.toLowerCase().includes('parent') ||
                               name.toLowerCase().includes('child');
      const subtaskIndicator = isSubtaskRelated ? ' 🔗 (Subtask-related)' : '';

      return `**${name}** (${linkType.id})${readOnly}${subtaskIndicator}\n` +
             `  Type: ${directed}, ${aggregation}\n` +
             `  Source → Target: ${linkType.sourceToTarget}\n` +
             `  Target → Source: ${linkType.targetToSource}`;
    }).join('\n\n');

    const scope = params.projectId ? `for project ${params.projectId}` : '(global)';
    const subtaskTypes = linkTypes.filter(lt => {
      const name = (lt.localizedName || lt.name).toLowerCase();
      return name.includes('subtask') || name.includes('parent') || name.includes('child');
    });

    let subtaskInfo = '';
    if (subtaskTypes.length > 0) {
      subtaskInfo = `\n\n**🔗 Subtask-related link types found:** ${subtaskTypes.map(lt => lt.localizedName || lt.name).join(', ')}`;
    } else {
      subtaskInfo = '\n\n**⚠️ No subtask-specific link types found.** You may need to configure subtask link types in YouTrack or use relationship types.';
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `**Available Link Types ${scope}:**\n\n${linkTypesText}${subtaskInfo}`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to get link types: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}
