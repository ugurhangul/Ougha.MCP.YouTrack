import { z } from 'zod';
import { YouTrackClient } from '../youtrack-client.js';
import { formatDate, formatApiError } from '../utils.js';

/**
 * MCP tools for YouTrack project management
 */

export const getProjectSchema = z.object({
  projectId: z.string().describe('Project ID or short name')
});

export const listProjectsSchema = z.object({
  includeArchived: z.boolean().default(false).describe('Include archived projects in the results')
});

/**
 * List all projects
 */
export async function listProjects(client: YouTrackClient, params: z.infer<typeof listProjectsSchema>) {
  try {
    const projects = await client.getProjects();
    
    // Filter out archived projects if not requested
    const filteredProjects = params.includeArchived 
      ? projects 
      : projects.filter(project => !project.archived);

    if (filteredProjects.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No projects found."
          }
        ]
      };
    }

    const projectsText = filteredProjects.map(project => {
      const archivedStatus = project.archived ? ' (Archived)' : '';
      const leader = project.leader ? ` | Leader: ${project.leader.fullName}` : '';
      const description = project.description ? `\n  Description: ${project.description}` : '';
      
      return `**${project.name}** (${project.shortName})${archivedStatus}${leader}` +
             `\n  Created: ${new Date(project.created).toLocaleString()}` +
             `\n  Updated: ${new Date(project.updated).toLocaleString()}` +
             description;
    }).join('\n\n');

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${filteredProjects.length} project(s):\n\n${projectsText}`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to list projects: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Get project details by ID or short name
 */
export async function getProject(client: YouTrackClient, params: z.infer<typeof getProjectSchema>) {
  try {
    const project = await client.getProject(params.projectId);
    
    const archivedStatus = project.archived ? ' (Archived)' : '';
    const leader = project.leader ? `**Leader:** ${project.leader.fullName} (${project.leader.login})\n` : '';
    const createdBy = project.createdBy ? `**Created by:** ${project.createdBy.fullName} (${project.createdBy.login})\n` : '';
    const updatedBy = project.updatedBy ? `**Updated by:** ${project.updatedBy.fullName} (${project.updatedBy.login})\n` : '';
    const description = project.description ? `\n**Description:**\n${project.description}\n` : '';

    return {
      content: [
        {
          type: "text" as const,
          text: `**Project: ${project.name}** (${project.shortName})${archivedStatus}\n\n` +
                `**ID:** ${project.id}\n` +
                leader +
                createdBy +
                updatedBy +
                `**Created:** ${formatDate(project.created)}\n` +
                `**Updated:** ${formatDate(project.updated)}` +
                description
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to get project: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}
