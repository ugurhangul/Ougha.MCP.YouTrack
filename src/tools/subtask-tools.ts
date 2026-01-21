import { z } from 'zod';
import { YouTrackClient } from '../youtrack-client.js';
import { CreateSubtaskRequest, CreateMultipleSubtasksRequest } from '../types.js';
import { formatApiError } from '../utils.js';

/**
 * MCP tools for YouTrack subtask management
 */

/**
 * Helper to normalize field names for CLI arguments (camelCase)
 */
function normalizeFieldName(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1).replace(/\s+/g, '');
}

/**
 * Helper to smart-map params to custom fields based on metadata
 */
function mapDynamicParamsToCustomFields(
  params: Record<string, any>, 
  metadata: Array<{ name: string; fieldType: { valueType: string } }>
): Record<string, any> {
  const mappedFields: Record<string, any> = {};
  const standardKeys = ['parentIssueId', 'summary', 'description', 'customFields'];

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
        mappedFields[name] = { minutes: value };
      } 
      else if (type.startsWith('user')) {
        mappedFields[name] = { id: value }; 
      }
      else if (type === 'date' || type === 'date and time') {
        mappedFields[name] = value;
      }
      else if (['integer', 'float', 'string', 'text'].includes(type)) {
        mappedFields[name] = value;
      } 
      else {
        // Enums/State etc
        mappedFields[name] = value; 
      }
    } else {
      // Fallback
      mappedFields[key] = value;
    }
  });

  // Merge in any explicit customFields passed
  if (params.customFields) {
    Object.assign(mappedFields, params.customFields);
  }

  return mappedFields;
}

// Helper to extract values from custom field instances
function getFieldValuesDescription(field: any): string {
  const values = new Set<string>();

  // 1. Try fetching from project instances
  if (field.instances && Array.isArray(field.instances)) {
    field.instances.forEach((instance: any) => {
      if (instance.bundle && instance.bundle.values && Array.isArray(instance.bundle.values)) {
        instance.bundle.values.forEach((val: any) => {
          if (val.name) values.add(val.name);
        });
      }
    });
  }

  // 2. Fallback to default bundle (Global fields like Type, State often live here)
  if (values.size === 0 && field.defaultBundle && field.defaultBundle.values && Array.isArray(field.defaultBundle.values)) {
    field.defaultBundle.values.forEach((val: any) => {
      if (val.name) values.add(val.name);
    });
  }

  if (values.size === 0) return '';
  // Limit to reasonable amount to avoid blowing up context
  const valuesList = Array.from(values).sort().slice(0, 50).join(', ');
  return ` Possible values: [${valuesList}]`;
}

/**
 * Dynamically build create subtask schema based on available custom fields
 */
export function buildCreateSubtaskSchema(customFields: Array<{ name: string; fieldType: { valueType: string } }> = []) {
  const baseSchema = {
    parentIssueId: z.string().describe('Parent issue ID (e.g., PROJECT-123)'),
    summary: z.string().describe('Subtask summary/title'),
    description: z.string().optional().describe('Subtask description'),
    // explicit customFields is an escape hatch
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

    // If it's a base field, enrich its description with values
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
      dynamicShape[normalizedName] = z.string().optional().describe(`${field.name} (${valueType}).${valuesDesc}`);
    }
  });

  return z.object(dynamicShape);
}

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
    estimationMinutes: z.number().min(0).optional().describe('Initial time estimation in minutes'),
    storyPoints: z.number().min(0).optional().describe('Story points value'),
    customFields: z.record(z.any()).optional().describe('Custom field values as key-value pairs')
  })).min(1).max(20).describe('Array of subtasks to create (max 20)')
});

/**
 * Create a new subtask and link it to a parent issue
 */
export async function createSubtask(
  client: YouTrackClient, 
  params: Record<string, any>,
  fieldMetadata: Array<{ name: string; fieldType: { valueType: string } }> = []
) {
  try {
    const customFields = mapDynamicParamsToCustomFields(params, fieldMetadata);
    
    // Project QM Hack: Suppress 'Type' if it exists and is 'Task' and project is QM
    if (customFields['Type'] === 'Task') {
       // tentative fix 
    }

    const subtaskRequest: CreateSubtaskRequest = {
      parentIssueId: params.parentIssueId,
      summary: params.summary,
      description: params.description,
      customFields: Object.keys(customFields).length > 0 ? customFields : undefined
    };

    const result = await client.createSubtask(subtaskRequest);

    return {
      content: [
        {
          type: "text" as const,
          text: `Successfully created subtask ${result.subtask.idReadable} linked to ${params.parentIssueId}:\n\n` +
                `**Summary:** ${result.subtask.summary}\n` +
                `**Link:** Subtask of ${params.parentIssueId}\n` +
                `**Created:** ${new Date(result.subtask.created).toLocaleString()}`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to create subtask: ${error.message}`
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
 * Dynamically build create multiple subtasks schema
 */
export function buildCreateMultipleSubtasksSchema(customFields: Array<{ name: string; fieldType: { valueType: string } }> = []) {
  // Use the single subtask schema shape as the base for items
  const subtaskShape = buildCreateSubtaskSchema(customFields).shape;
  
  // Create an object schema from the shape
  const subtaskItemSchema = z.object(subtaskShape);

  return z.object({
    parentIssueId: z.string().describe('Parent issue ID (e.g., PROJECT-123)'),
    subtasks: z.array(subtaskItemSchema).max(20).describe('Array of subtasks to create (max 20)')
  });
}

/**
 * Create multiple subtasks for a parent issue
 */
export async function createMultipleSubtasks(client: YouTrackClient, params: Record<string, any>, customFieldsMetadata: Array<{ name: string; fieldType: { valueType: string } }> = []) {
  try {
    // Process each subtask to map dynamic fields
    const processedSubtasks = params.subtasks.map((subtaskParams: Record<string, any>) => {
      // 1. Map dynamic params to custom fields for this subtask
      const customFields = mapDynamicParamsToCustomFields(subtaskParams, customFieldsMetadata);

      // 2. Construct the subtask request object
      // We explicitly extract standard fields and pass everything else as custom fields
      return {
        summary: subtaskParams.summary,
        description: subtaskParams.description,
        assignee: subtaskParams.assignee,
        priority: subtaskParams.priority,
        estimationMinutes: subtaskParams.estimationMinutes,
        storyPoints: subtaskParams.storyPoints,
        // The helper already merged explicit customFields with dynamic ones
        customFields: Object.keys(customFields).length > 0 ? customFields : undefined
      };
    });

    const request: CreateMultipleSubtasksRequest = {
      parentIssueId: params.parentIssueId,
      subtasks: processedSubtasks
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
