import { z } from 'zod';
import { YouTrackClient } from '../youtrack-client.js';
import { formatApiError, formatDateForTimezone } from '../utils.js';
import { GanttExportOptions } from '../types.js';

/**
 * MCP tools for YouTrack Gantt chart functionality
 */

export const getGanttDataSchema = z.object({
  projectIds: z.array(z.string()).optional().describe('Project IDs to include (leave empty for all projects)'),
  assigneeIds: z.array(z.string()).optional().describe('Assignee user IDs to filter by'),
  startDate: z.number().optional().describe('Filter issues created after this date (Unix timestamp)'),
  endDate: z.number().optional().describe('Filter issues created before this date (Unix timestamp)'),
  includeCompleted: z.boolean().default(true).describe('Include completed/resolved issues'),
  includeSubtasks: z.boolean().default(true).describe('Include subtask relationships'),
  stateNames: z.array(z.string()).optional().describe('Filter by specific state names'),
  priorityNames: z.array(z.string()).optional().describe('Filter by specific priority names'),
  typeNames: z.array(z.string()).optional().describe('Filter by specific issue type names'),
  query: z.string().optional().describe('Additional YouTrack query syntax filter')
});

export const exportGanttChartSchema = z.object({
  projectIds: z.array(z.string()).optional().describe('Project IDs to include'),
  format: z.enum(['json', 'csv', 'mermaid']).describe('Export format'),
  includeSubtasks: z.boolean().default(true).describe('Include subtask relationships'),
  includeDependencies: z.boolean().default(true).describe('Include dependency information'),
  includeMilestones: z.boolean().default(true).describe('Include milestone information'),
  dateFormat: z.enum(['iso', 'timestamp', 'locale']).default('iso').describe('Date format in export'),
  timezone: z.string().optional().describe('Timezone for date formatting (e.g., "America/New_York")'),
  assigneeIds: z.array(z.string()).optional().describe('Filter by assignee IDs'),
  query: z.string().optional().describe('YouTrack query filter')
});

export const updateIssueTimelineSchema = z.object({
  issueId: z.string().describe('Issue ID (e.g., PROJECT-123)'),
  startDate: z.number().optional().describe('Start date (Unix timestamp)'),
  dueDate: z.number().optional().describe('Due date (Unix timestamp)'),
  estimation: z.number().optional().describe('Estimation in minutes')
});

export const getProjectTimelineSchema = z.object({
  projectId: z.string().describe('Project ID or short name'),
  includeSubtasks: z.boolean().default(true).describe('Include subtask relationships'),
  includeCompleted: z.boolean().default(false).describe('Include completed issues')
});

export const calculateCriticalPathSchema = z.object({
  projectId: z.string().describe('Project ID or short name')
});

export const getTimelineConflictsSchema = z.object({
  projectIds: z.array(z.string()).optional().describe('Project IDs to check (leave empty for all projects)'),
  assigneeIds: z.array(z.string()).optional().describe('Check conflicts for specific assignees only')
});

/**
 * Get Gantt chart data with filtering options
 */
export async function getGanttData(client: YouTrackClient, params: z.infer<typeof getGanttDataSchema>) {
  try {
    const ganttData = await client.getGanttData({
      projectIds: params.projectIds,
      assigneeIds: params.assigneeIds,
      startDate: params.startDate,
      endDate: params.endDate,
      includeCompleted: params.includeCompleted,
      includeSubtasks: params.includeSubtasks,
      stateNames: params.stateNames,
      priorityNames: params.priorityNames,
      typeNames: params.typeNames,
      query: params.query
    });

    const tasksText = ganttData.tasks.map(task => {
      const dates = [];
      if (task.startDate) dates.push(`Start: ${new Date(task.startDate).toLocaleDateString()}`);
      if (task.dueDate) dates.push(`Due: ${new Date(task.dueDate).toLocaleDateString()}`);

      const progress = task.progress ? ` (${task.progress.toFixed(0)}% complete)` : '';
      const assignee = task.assignee ? ` | Assignee: ${task.assignee.fullName}` : '';
      const dependencies = task.dependencies.length > 0
        ? ` | Dependencies: ${task.dependencies.map(d => d.targetTaskIdReadable).join(', ')}`
        : '';

      return `**${task.idReadable}** - ${task.summary}${progress}\n` +
             `  Project: ${task.project.shortName}${assignee}\n` +
             `  ${dates.join(' | ')}${dependencies}`;
    }).join('\n\n');

    const conflictsText = ganttData.conflicts.length > 0
      ? `\n\n⚠️ **Conflicts Detected:**\n${ganttData.conflicts.map(conflict =>
          `- ${conflict.description} (${conflict.severity})`
        ).join('\n')}`
      : '';

    return {
      content: [
        {
          type: "text" as const,
          text: `📊 **Gantt Chart Data for ${ganttData.project.name}**\n\n` +
                `**Timeline:** ${new Date(ganttData.timeline.startDate).toLocaleDateString()} - ${new Date(ganttData.timeline.endDate).toLocaleDateString()} (${ganttData.timeline.duration} days)\n\n` +
                `**Summary:**\n` +
                `- Total Tasks: ${ganttData.metadata.totalTasks}\n` +
                `- Completed: ${ganttData.metadata.completedTasks}\n` +
                `- Overdue: ${ganttData.metadata.overdueTasks}\n\n` +
                `**Tasks:**\n${tasksText}${conflictsText}`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to get Gantt chart data: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Export Gantt chart in various formats
 */
export async function exportGanttChart(client: YouTrackClient, params: z.infer<typeof exportGanttChartSchema>) {
  try {
    const ganttData = await client.getGanttData({
      projectIds: params.projectIds,
      assigneeIds: params.assigneeIds,
      includeSubtasks: params.includeSubtasks,
      includeCompleted: true, // Include completed tasks for export by default
      query: params.query
    });

    let exportContent: string;
    let contentType: string;

    switch (params.format) {
      case 'json':
        exportContent = JSON.stringify(ganttData, null, 2);
        contentType = 'application/json';
        break;

      case 'csv':
        exportContent = convertToCSV(ganttData, params);
        contentType = 'text/csv';
        break;

      case 'mermaid':
        exportContent = convertToMermaid(ganttData, params);
        contentType = 'text/plain';
        break;

      default:
        throw new Error(`Unsupported export format: ${params.format}`);
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `📁 **Gantt Chart Export (${params.format.toUpperCase()})**\n\n` +
                `Project: ${ganttData.project.name}\n` +
                `Generated: ${new Date().toLocaleString()}\n` +
                `Tasks: ${ganttData.tasks.length}\n\n` +
                `\`\`\`${params.format === 'json' ? 'json' : params.format === 'csv' ? 'csv' : 'mermaid'}\n${exportContent}\n\`\`\``
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to export Gantt chart: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Convert Gantt data to CSV format
 */
function convertToCSV(ganttData: any, options: GanttExportOptions): string {
  const headers = [
    'ID', 'Summary', 'Project', 'Assignee', 'Start Date', 'Due Date',
    'Progress', 'Estimation (hours)', 'Spent Time (hours)', 'Story Points',
    'Priority', 'State', 'Type', 'Dependencies'
  ];

  const rows = ganttData.tasks.map((task: any) => {
    const formatDate = (timestamp?: number) => {
      if (!timestamp) return '';
      try {
        // Handle timestamp format separately since it's not supported by formatDateForTimezone
        if (options.dateFormat === 'timestamp') {
          return timestamp.toString();
        }
        return formatDateForTimezone(timestamp, options.timezone, options.dateFormat as 'iso' | 'locale');
      } catch (error) {
        // Fallback to basic formatting if timezone formatting fails
        const date = new Date(timestamp);
        switch (options.dateFormat) {
          case 'iso': return date.toISOString();
          case 'timestamp': return timestamp.toString();
          case 'locale': return date.toLocaleString();
          default: return date.toISOString();
        }
      }
    };

    return [
      task.idReadable,
      `"${task.summary.replace(/"/g, '""')}"`,
      task.project.shortName,
      task.assignee?.fullName || '',
      formatDate(task.startDate),
      formatDate(task.dueDate),
      task.progress || 0,
      task.estimation ? (task.estimation.minutes / 60).toFixed(2) : '',
      task.spentTime ? (task.spentTime.minutes / 60).toFixed(2) : '',
      task.storyPoints || '',
      task.priority?.name || '',
      task.state?.name || '',
      task.type?.name || '',
      task.dependencies.map((d: any) => d.targetTaskIdReadable).join('; ')
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Convert Gantt data to Mermaid diagram format
 */
function convertToMermaid(ganttData: any, options: GanttExportOptions): string {
  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '';
    try {
      return formatDateForTimezone(timestamp, options.timezone, 'date-only');
    } catch (error) {
      // Fallback to basic formatting
      return new Date(timestamp).toISOString().split('T')[0];
    }
  };

  let mermaid = `gantt\n    title ${ganttData.project.name} Timeline\n    dateFormat YYYY-MM-DD\n\n`;

  // Group tasks by project or assignee
  const sections = new Map<string, any[]>();

  for (const task of ganttData.tasks) {
    const sectionKey = task.assignee?.fullName || 'Unassigned';
    if (!sections.has(sectionKey)) {
      sections.set(sectionKey, []);
    }
    sections.get(sectionKey)!.push(task);
  }

  for (const [sectionName, tasks] of sections) {
    mermaid += `    section ${sectionName}\n`;

    for (const task of tasks) {
      const taskName = task.summary.replace(/[^\w\s]/g, '').substring(0, 30);
      const startDate = formatDate(task.startDate) || formatDate(task.created);
      const endDate = formatDate(task.dueDate) || formatDate(task.updated);

      const status = task.state?.isResolved ? 'done' :
                    task.progress && task.progress > 0 ? 'active' : '';

      mermaid += `    ${taskName} :${status}, ${task.idReadable}, ${startDate}, ${endDate}\n`;
    }
    mermaid += '\n';
  }

  return mermaid;
}

/**
 * Update issue timeline (start date, due date, estimation)
 */
export async function updateIssueTimeline(client: YouTrackClient, params: z.infer<typeof updateIssueTimelineSchema>) {
  try {
    const updatedIssue = await client.updateIssueTimeline(params.issueId, {
      startDate: params.startDate,
      dueDate: params.dueDate,
      estimation: params.estimation
    });

    const updates = [];
    if (params.startDate) updates.push(`Start Date: ${new Date(params.startDate).toLocaleDateString()}`);
    if (params.dueDate) updates.push(`Due Date: ${new Date(params.dueDate).toLocaleDateString()}`);
    if (params.estimation) updates.push(`Estimation: ${(params.estimation / 60).toFixed(1)} hours`);

    return {
      content: [
        {
          type: "text" as const,
          text: `✅ **Timeline Updated for ${updatedIssue.idReadable}**\n\n` +
                `**Issue:** ${updatedIssue.summary}\n` +
                `**Updates:** ${updates.join(', ')}\n` +
                `**Last Modified:** ${new Date(updatedIssue.updated).toLocaleString()}`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to update issue timeline: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Get project timeline with milestones
 */
export async function getProjectTimeline(client: YouTrackClient, params: z.infer<typeof getProjectTimelineSchema>) {
  try {
    const ganttData = await client.getGanttData({
      projectIds: [params.projectId],
      includeSubtasks: params.includeSubtasks,
      includeCompleted: params.includeCompleted ?? true // Default to true if not specified
    });

    const timelineText = ganttData.tasks
      .filter(task => task.startDate || task.dueDate)
      .sort((a, b) => (a.startDate || a.created) - (b.startDate || b.created))
      .map(task => {
        const start = task.startDate ? new Date(task.startDate).toLocaleDateString() : 'No start date';
        const due = task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date';
        const progress = task.progress ? ` (${task.progress.toFixed(0)}%)` : '';
        const assignee = task.assignee ? ` - ${task.assignee.fullName}` : '';

        return `📅 **${start} → ${due}**: ${task.idReadable} - ${task.summary}${progress}${assignee}`;
      }).join('\n');

    const milestonesText = ganttData.milestones.length > 0
      ? `\n\n🎯 **Milestones:**\n${ganttData.milestones.map(milestone =>
          `- ${new Date(milestone.date).toLocaleDateString()}: ${milestone.name}`
        ).join('\n')}`
      : '';

    return {
      content: [
        {
          type: "text" as const,
          text: `📈 **Project Timeline: ${ganttData.project.name}**\n\n` +
                `**Duration:** ${ganttData.timeline.duration} days\n` +
                `**Period:** ${new Date(ganttData.timeline.startDate).toLocaleDateString()} - ${new Date(ganttData.timeline.endDate).toLocaleDateString()}\n\n` +
                `**Tasks by Timeline:**\n${timelineText}${milestonesText}`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to get project timeline: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Calculate critical path for a project
 */
export async function calculateCriticalPath(client: YouTrackClient, params: z.infer<typeof calculateCriticalPathSchema>) {
  try {
    const criticalPath = await client.calculateCriticalPath(params.projectId);

    if (criticalPath.path.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `📊 **Critical Path Analysis: No tasks found**\n\nProject ${params.projectId} has no tasks with timeline data for critical path analysis.`
          }
        ]
      };
    }

    const criticalTasksText = criticalPath.path.map(taskId => {
      const task = criticalPath.tasks.find(t => t.idReadable === taskId);
      if (!task) return `- ${taskId} (details not available)`;

      const dates = [];
      if (task.startDate) dates.push(`Start: ${new Date(task.startDate).toLocaleDateString()}`);
      if (task.dueDate) dates.push(`Due: ${new Date(task.dueDate).toLocaleDateString()}`);

      return `- **${task.idReadable}**: ${task.summary}\n  Duration: ${task.duration.toFixed(1)} days | ${dates.join(' | ')}`;
    }).join('\n');

    const allTasksText = criticalPath.tasks
      .sort((a, b) => a.slack - b.slack)
      .slice(0, 10) // Show top 10 tasks by slack
      .map(task => {
        const slackText = task.slack === 0 ? '🔴 Critical' :
                         task.slack < 1 ? '🟡 Near Critical' :
                         `🟢 ${task.slack.toFixed(1)} days slack`;
        return `- **${task.idReadable}**: ${slackText} | ${task.duration.toFixed(1)} days`;
      }).join('\n');

    return {
      content: [
        {
          type: "text" as const,
          text: `🎯 **Critical Path Analysis**\n\n` +
                `**Project Duration:** ${criticalPath.duration.toFixed(1)} days\n` +
                `**Critical Path Length:** ${criticalPath.path.length} tasks\n\n` +
                `**Critical Path Tasks:**\n${criticalTasksText}\n\n` +
                `**All Tasks by Slack Time:**\n${allTasksText}`
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to calculate critical path: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}
/**
 * Get timeline conflicts
 */
export async function getTimelineConflicts(client: YouTrackClient, params: z.infer<typeof getTimelineConflictsSchema>) {
  try {
    const ganttData = await client.getGanttData({
      projectIds: params.projectIds,
      assigneeIds: params.assigneeIds,
      includeCompleted: true // Include completed tasks for conflict analysis
    });

    if (ganttData.conflicts.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `✅ **No Timeline Conflicts Detected**\n\nAll tasks in the specified scope have compatible schedules and dependencies.`
          }
        ]
      };
    }

    const conflictsByType = ganttData.conflicts.reduce((acc, conflict) => {
      if (!acc[conflict.type]) acc[conflict.type] = [];
      acc[conflict.type].push(conflict);
      return acc;
    }, {} as Record<string, any[]>);

    const conflictText = Object.entries(conflictsByType).map(([type, conflicts]) => {
      const typeTitle = type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const conflictList = conflicts.map(conflict => {
        const severity = conflict.severity === 'high' ? '🔴' :
                        conflict.severity === 'medium' ? '🟡' : '🟢';
        return `  ${severity} ${conflict.description}\n    Tasks: ${conflict.taskIds.join(', ')}`;
      }).join('\n');

      return `**${typeTitle} (${conflicts.length}):**\n${conflictList}`;
    }).join('\n\n');

    return {
      content: [
        {
          type: "text" as const,
          text: `⚠️ **Timeline Conflicts Detected**\n\n` +
                `**Total Conflicts:** ${ganttData.conflicts.length}\n\n` +
                conflictText
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to get timeline conflicts: ${formatApiError(error)}`
        }
      ],
      isError: true
    };
  }
}