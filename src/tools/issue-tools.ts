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

export const getAllIssuesSchema = z.object({
  project: z.string().describe('Project ID or short name (required)'),
  includeResolved: z.boolean().default(false).describe('Include resolved/closed issues'),
  onlyResolved: z.boolean().default(false).describe('Get only resolved/closed issues'),
  limit: z.number().min(1).max(500).default(100).describe('Maximum number of issues to return'),
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
 * dynamically build create issue schema based on available custom fields
 */
/**
 * Helper to normalize field names for CLI arguments (camelCase)
 */
function normalizeFieldName(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1).replace(/\s+/g, '');
}

// Helper to extract values from custom field instances and group by project
function getFieldValuesDescription(field: any): string {
  // Track values per project: Map<projectShortName | 'Global', Set<string>>
  const projectValues = new Map<string, Set<string>>();

  // 1. Try fetching from project instances
  if (field.instances && Array.isArray(field.instances)) {
    field.instances.forEach((instance: any) => {
      if (instance.bundle && instance.bundle.values && Array.isArray(instance.bundle.values)) {
        const projectKey = instance.project?.shortName || 'Unknown';

        if (!projectValues.has(projectKey)) {
          projectValues.set(projectKey, new Set<string>());
        }

        const projectSet = projectValues.get(projectKey)!;
        instance.bundle.values.forEach((val: any) => {
          if (val.name) projectSet.add(val.name);
        });
      }
    });
  }

  // 2. Fallback to default bundle (Global fields like Type, State often live here)
  if (projectValues.size === 0 && field.defaultBundle && field.defaultBundle.values && Array.isArray(field.defaultBundle.values)) {
    const globalSet = new Set<string>();
    field.defaultBundle.values.forEach((val: any) => {
      if (val.name) globalSet.add(val.name);
    });
    if (globalSet.size > 0) {
      projectValues.set('Global', globalSet);
    }
  }

  if (projectValues.size === 0) return '';

  // Check if all projects have the same values - if so, show simple list
  const allValueSets = Array.from(projectValues.values());
  const allValuesMatch = allValueSets.length > 1 && allValueSets.every((set, _, arr) => {
    const first = arr[0];
    if (set.size !== first.size) return false;
    for (const val of set) {
      if (!first.has(val)) return false;
    }
    return true;
  });

  if (allValuesMatch || projectValues.size === 1) {
    // All projects have same values or only one project - show simple list
    const values = Array.from(projectValues.values())[0];
    const valuesList = Array.from(values).sort().slice(0, 50).join(', ');
    return ` Possible values: [${valuesList}]`;
  }

  // Projects have different values - show per-project breakdown
  const projectDescriptions: string[] = [];
  projectValues.forEach((values, projectKey) => {
    const valuesList = Array.from(values).sort().slice(0, 25).join(', ');
    projectDescriptions.push(`${projectKey}: [${valuesList}]`);
  });

  return ` Possible values: ${projectDescriptions.join('; ')}`;
}

/**
 * Dynamically build create issue schema based on available custom fields
 */
export function buildCreateIssueSchema(customFields: Array<{ name: string; fieldType: { valueType: string } }> = []) {
  // Only strictly required/standard API fields remain here
  const baseSchema = {
    project: z.string().describe('Project ID or short name'),
    summary: z.string().describe('Issue summary/title'),
    description: z.string().optional().describe('Issue description'),
    parentIssue: z.string().optional().describe('Parent issue ID to create this as a subtask (e.g., PROJECT-123)'),
    // We allow an explicit customFields object as an escape hatch, though we prefer top-level args
    customFields: z.record(z.any()).optional().describe('Explicit custom field values map (advanced usage)')
  };

  const dynamicShape: Record<string, z.ZodTypeAny> = { ...baseSchema };

  customFields.forEach(field => {
    const normalizedName = normalizeFieldName(field.name);
    const valueType = field.fieldType.valueType.toLowerCase();
    const valuesDesc = getFieldValuesDescription(field);

    // Dynamic Filter: Skip fields that require values but have none (e.g. dead fields like kanbanState)
    const requiresValues = ['enum', 'state', 'version', 'build', 'ownedfield'];
    if (requiresValues.includes(valueType) && !valuesDesc) {
      return;
    }

    // If it's a base field (e.g. "State", "Priority"), enrich its description with values
    if (normalizedName in baseSchema) {
      if (!baseSchema[normalizedName as keyof typeof baseSchema]) return;

      if (valuesDesc) {
        const existingDesc = (baseSchema[normalizedName as keyof typeof baseSchema] as any).description;
        dynamicShape[normalizedName] = (baseSchema[normalizedName as keyof typeof baseSchema] as any).describe(`${existingDesc}.${valuesDesc}`);
      }
      return;
    }

    // Map YouTrack types to Zod types
    if (['integer', 'float', 'period'].includes(valueType)) {
      dynamicShape[normalizedName] = z.number().optional().describe(`${field.name} (${valueType}).${valuesDesc}`);
    } else {
      // Default to string for everything else (enums, users, states, dates, etc.)
      dynamicShape[normalizedName] = z.string().optional().describe(`${field.name} (${valueType}).${valuesDesc}`);
    }
  });

  return z.object(dynamicShape);
}

/**
 * Helper to smart-map params to custom fields based on metadata
 */
function mapDynamicParamsToCustomFields(
  params: Record<string, any>,
  metadata: Array<{ name: string; fieldType: { valueType: string } }>
): Record<string, any> {
  const mappedFields: Record<string, any> = {};
  const standardKeys = ['project', 'summary', 'description', 'parentIssue', 'issueId', 'customFields'];

  // Create a lookup map: normalizedName -> metadata
  const fieldLookup = new Map(metadata.map(f => [normalizeFieldName(f.name), f]));

  Object.entries(params).forEach(([key, value]) => {
    if (standardKeys.includes(key) || value === undefined) return;

    // Check if this param corresponds to a known custom field
    const fieldMeta = fieldLookup.get(key);

    if (fieldMeta) {
      const { name, fieldType } = fieldMeta;
      const type = fieldType.valueType.toLowerCase();

      // Smart formatting based on type
      if (type === 'period') {
        // YouTrack expects period fields as { minutes: number }
        mappedFields[name] = { minutes: value };
      }
      else if (type.startsWith('user')) {
        // Users are set by ID or login usually, needs wrapping if string
        mappedFields[name] = { id: value }; // YouTrackClient usually handles this, but being explicit is good
      }
      else if (type === 'date' || type === 'date and time') {
        mappedFields[name] = value;
      }
      else if (['integer', 'float', 'string', 'text'].includes(type)) {
        // Simple scalar values
        mappedFields[name] = value;
      }
      else {
        // Enums, States, Builds, Versions, etc. usually expect { name: "Value" }
        // The YouTrackClient's mergeCustomFields also does this, but we can prepare it here.
        // However, passing just the value relies on YouTrackClient to wrap it in {name: ...}
        // which it does for unknown types.
        mappedFields[name] = value;
      }
    } else {
      // Fallback: If passed a param that isn't in metadata but was in the input (maybe from a loose schema?),
      // pass it through. This supports fields we might have missed in metadata fetch.
      // We assume Key is the Field Name if not found in normalized map.
      mappedFields[key] = value;
    }
  });

  // Merge in any explicit customFields passed
  if (params.customFields) {
    Object.assign(mappedFields, params.customFields);
  }

  return mappedFields;
}

/**
 * Create a new issue
 */
export async function createIssue(
  client: YouTrackClient,
  params: Record<string, any>,
  fieldMetadata: Array<{ name: string; fieldType: { valueType: string } }> = []
) {
  try {
    // Separate standard fields
    const createRequest: CreateIssueRequest = {
      project: params.project,
      summary: params.summary,
      description: params.description,
    };

    // Map everything else to customFields
    const customFields = mapDynamicParamsToCustomFields(params, fieldMetadata);

    // Project QM Hack: Suppress 'Type' if it exists and is 'Task' and project is QM
    // This logic needs to check the Real Name "Type" now.
    const isProjectQM = params.project === 'QM' || params.project === '0-1';
    if (isProjectQM && customFields['Type'] === 'Task') {
      delete customFields['Type'];
    }

    // Assign mapped custom fields
    if (Object.keys(customFields).length > 0) {
      createRequest.customFields = customFields;
    }

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
                `**Created:** ${new Date(issue.created).toLocaleString()}\n\n` +
                `❌ **Subtask Link Failed:** ${linkError.message}\n`
            }
          ],
          isError: true
        };
      }
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `Successfully created ${params.parentIssue ? 'subtask' : 'issue'} ${issue.idReadable}:\n\n` +
            `**Summary:** ${issue.summary}\n` +
            `**Project:** ${issue.project.name} (${issue.project.shortName})\n` +
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
 * Get issue details by ID
 */
export async function getIssue(client: YouTrackClient, params: z.infer<typeof getIssueSchema>) {
  try {
    const issue = await client.getIssue(params.issueId);

    // Format comments if present
    let commentsSection = '';
    if (issue.comments && issue.comments.length > 0) {
      const activeComments = issue.comments.filter(c => !c.deleted);
      if (activeComments.length > 0) {
        commentsSection = `\n\n**Comments (${activeComments.length}):**\n` +
          activeComments.map(c =>
            `---\n**${c.author?.fullName || c.author?.login || 'Unknown'}** - ${new Date(c.created).toLocaleString()}${c.updated ? ' (edited)' : ''}\n${c.text}`
          ).join('\n');
      }
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `**${issue.idReadable}** - ${issue.summary}\n` +
            `**Project:** ${issue.project.name} (${issue.project.shortName})\n` +
            `**State:** ${issue.customFields?.find(f => f.name === 'State')?.value?.name || 'Unknown'}\n` +
            `**Assignee:** ${issue.assignee?.fullName || 'Unassigned'}\n` +
            `**Priority:** ${issue.customFields?.find(f => f.name === 'Priority')?.value?.name || 'Unknown'}\n` +
            `**Created:** ${new Date(issue.created).toLocaleString()}\n` +
            `**Updated:** ${new Date(issue.updated).toLocaleString()}\n` +
            (issue.description ? `\n**Description:**\n${issue.description}` : '') +
            commentsSection
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
 * Dynamically build update issue schema based on available custom fields
 */
export function buildUpdateIssueSchema(customFields: Array<{ name: string; fieldType: { valueType: string } }> = []) {
  const baseSchema = {
    issueId: z.string().describe('Issue ID (e.g., PROJECT-123)'),
    summary: z.string().optional().describe('New issue summary/title'),
    description: z.string().optional().describe('New issue description'),
    customFields: z.record(z.any()).optional().describe('Explicit custom field values map')
  };

  const dynamicShape: Record<string, z.ZodTypeAny> = { ...baseSchema };

  customFields.forEach(field => {
    const normalizedName = normalizeFieldName(field.name);
    const valueType = field.fieldType.valueType.toLowerCase();
    const valuesDesc = getFieldValuesDescription(field);

    // Dynamic Filter: Skip fields that require values but have none
    const requiresValues = ['enum', 'state', 'version', 'build', 'ownedfield'];
    if (requiresValues.includes(valueType) && !valuesDesc) {
      return;
    }

    // If it's a base field (e.g. "State", "Priority"), enrich its description with values
    if (normalizedName in baseSchema) {
      if (!baseSchema[normalizedName as keyof typeof baseSchema]) return;

      if (valuesDesc) {
        const existingDesc = (baseSchema[normalizedName as keyof typeof baseSchema] as any).description;
        dynamicShape[normalizedName] = (baseSchema[normalizedName as keyof typeof baseSchema] as any).describe(`${existingDesc}.${valuesDesc}`);
      }
      return;
    }

    if (['integer', 'float', 'period'].includes(valueType)) {
      dynamicShape[normalizedName] = z.number().optional().describe(`${field.name} (${valueType}).${valuesDesc}`);
    } else {
      dynamicShape[normalizedName] = z.string().optional().describe(`${field.name} (${valueType}).${valuesDesc}`);
    }
  });

  return z.object(dynamicShape);
}

/**
 * Update an existing issue
 */
export async function updateIssue(
  client: YouTrackClient,
  params: Record<string, any>,
  fieldMetadata: Array<{ name: string; fieldType: { valueType: string } }> = []
) {
  try {
    const customFields = mapDynamicParamsToCustomFields(params, fieldMetadata);

    const updateRequest: UpdateIssueRequest = {
      summary: params.summary,
      description: params.description,
      // All other fields are now handled via customFields map
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
            `**Updated:** ${formatDate(issue.updated)}\n`
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
 * Get all issues for a project
 */
export async function getAllIssues(client: YouTrackClient, params: z.infer<typeof getAllIssuesSchema>) {
  try {
    // Build query string for project filtering
    let query = `project: ${params.project}`;

    // Add state filter based on resolved preferences
    // Use YouTrack's universal #Resolved/#Unresolved tags - works regardless of field naming (State vs Stage)
    if (params.onlyResolved) {
      query += ' #Resolved';
    } else if (!params.includeResolved) {
      query += ' #Unresolved';
    }

    const searchRequest: SearchIssuesRequest = {
      query,
      limit: params.limit,
      skip: params.skip
    };

    const result = await client.searchIssues(searchRequest);

    if (result.items.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No issues found in project ${params.project}.`
          }
        ]
      };
    }

    const issuesText = result.items.map(issue => {
      // Extract state from custom fields
      const stateField = issue.customFields?.find(f => f.name === 'State' || f.name === 'Stage');
      const state = stateField?.value?.name || 'Unknown';

      // Extract priority from custom fields
      const priorityField = issue.customFields?.find(f => f.name === 'Priority');
      const priority = priorityField?.value?.name || '-';

      // Extract story points from custom fields
      const storyPointsField = issue.customFields?.find(field => field.name === 'Story Points');
      const storyPoints = storyPointsField?.value ? ` (${storyPointsField.value} SP)` : '';

      return `**${issue.idReadable}** - ${issue.summary}\n` +
        `  State: ${state} | Priority: ${priority}${storyPoints}\n` +
        `  Assignee: ${issue.assignee?.fullName || 'Unassigned'}\n` +
        `  Updated: ${new Date(issue.updated).toLocaleString()}`;
    }).join('\n\n');

    const paginationInfo = result.hasMore
      ? `\n\n---\n_Showing ${params.skip + 1}-${params.skip + result.items.length} issues. More available with skip=${params.skip + params.limit}_`
      : '';

    return {
      content: [
        {
          type: "text" as const,
          text: `**Project ${params.project}**: Found ${result.items.length} issue(s)${result.totalCount ? ` of ${result.totalCount} total` : ''}${result.hasMore ? ' (more available)' : ''}:\n\n${issuesText}${paginationInfo}`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to get issues: ${error.message}`
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
