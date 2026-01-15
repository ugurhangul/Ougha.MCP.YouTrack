/**
 * TypeScript interfaces for YouTrack API entities and responses
 */

export interface YouTrackConfig {
  url: string;
  token: string;
  timeout?: number;
  rateLimit?: number;
  debug?: boolean;
}

export interface YouTrackUser {
  id: string;
  login: string;
  fullName: string;
  email?: string;
  avatarUrl?: string;
  online?: boolean;
  banned?: boolean;
}

export interface YouTrackProject {
  id: string;
  name: string;
  shortName: string;
  description?: string;
  leader?: YouTrackUser;
  createdBy?: YouTrackUser;
  updatedBy?: YouTrackUser;
  created: number;
  updated: number;
  archived?: boolean;
}

export interface YouTrackIssueType {
  id: string;
  name: string;
  description?: string;
}

export interface YouTrackState {
  id: string;
  name: string;
  description?: string;
  isResolved?: boolean;
}

export interface YouTrackPriority {
  id: string;
  name: string;
  description?: string;
}

export interface YouTrackCustomField {
  id: string;
  name: string;
  value?: any;
  projectCustomField?: {
    field: {
      name: string;
      fieldType: {
        valueType: string;
      };
    };
  };
}

export interface YouTrackIssue {
  id: string;
  idReadable: string;
  summary: string;
  description?: string;
  project: YouTrackProject;
  reporter?: YouTrackUser;
  updater?: YouTrackUser;
  assignee?: YouTrackUser;
  created: number;
  updated: number;
  resolved?: number;
  numberInProject: number;
  customFields?: YouTrackCustomField[];
  tags?: Array<{ name: string }>;
  comments?: YouTrackComment[];
}

export interface YouTrackComment {
  id: string;
  text: string;
  author: YouTrackUser;
  created: number;
  updated?: number;
  deleted?: boolean;
}

export interface YouTrackSearchResult<T> {
  items: T[];
  hasMore?: boolean;
  totalCount?: number;
}

export interface CreateIssueRequest {
  project: string;
  summary: string;
  description?: string;
  assignee?: string;
  priority?: string;
  type?: string;
  customFields?: Record<string, any>;
}

export interface UpdateIssueRequest {
  summary?: string;
  description?: string;
  assignee?: string;
  state?: string;
  priority?: string;
  customFields?: Record<string, any>;
}

export interface SearchIssuesRequest {
  query?: string;
  project?: string;
  assignee?: string;
  state?: string;
  limit?: number;
  skip?: number;
}

export interface YouTrackApiError {
  error: string;
  error_description?: string;
  error_developer_message?: string;
}

export interface RateLimitInfo {
  remaining: number;
  resetTime: number;
  limit: number;
}

// Time Tracking Interfaces
export interface YouTrackWorkItem {
  id: string;
  author: YouTrackUser;
  date: number;
  duration: {
    id: string;
    minutes: number;
    presentation: string;
  };
  description?: string;
  type?: {
    id: string;
    name: string;
  };
  created: number;
  updated?: number;
}

export interface CreateWorkItemRequest {
  date?: number; // Unix timestamp, defaults to current time
  duration: number; // Duration in minutes
  description?: string;
  type?: string; // Work item type name
}

export interface UpdateWorkItemRequest {
  date?: number;
  duration?: number;
  description?: string;
  type?: string;
}

export interface TimeTrackingSummary {
  estimation?: {
    minutes: number;
    presentation: string;
  };
  spentTime?: {
    minutes: number;
    presentation: string;
  };
  workItems: YouTrackWorkItem[];
}

// Issue Links Interfaces
export interface YouTrackLinkType {
  id: string;
  name: string;
  localizedName?: string;
  sourceToTarget: string;
  targetToSource: string;
  directed: boolean;
  aggregation: boolean;
  readOnly: boolean;
}

export interface YouTrackIssueLink {
  id: string;
  direction: 'OUTWARD' | 'INWARD' | 'BOTH';
  linkType: YouTrackLinkType;
  issues: YouTrackIssue[];
  trimmedIssues: YouTrackIssue[];
}

// Subtask Management Interfaces
export interface CreateSubtaskRequest {
  parentIssueId: string;
  summary: string;
  description?: string;
  assignee?: string;
  priority?: string;
  type?: string;
  estimationMinutes?: number;
  storyPoints?: number;
  customFields?: Record<string, any>;
}

export interface SubtaskInfo {
  id: string;
  idReadable: string;
  summary: string;
  description?: string;
  assignee?: YouTrackUser;
  priority?: YouTrackPriority;
  state?: YouTrackState;
  type?: YouTrackIssueType;
  created: number;
  updated: number;
  resolved?: number;
  estimation?: {
    minutes: number;
    presentation: string;
  };
  spentTime?: {
    minutes: number;
    presentation: string;
  };
  storyPoints?: number;
  parentIssue?: {
    id: string;
    idReadable: string;
    summary: string;
  };
}

export interface CreateMultipleSubtasksRequest {
  parentIssueId: string;
  subtasks: Array<{
    summary: string;
    description?: string;
    assignee?: string;
    priority?: string;
    type?: string;
    estimationMinutes?: number;
    storyPoints?: number;
    customFields?: Record<string, any>;
  }>;
}

export interface CreateIssueLinkRequest {
  linkType: string; // Link type name or ID
  targetIssue: string; // Target issue ID
  direction?: 'OUTWARD' | 'INWARD'; // Direction of the link, defaults to OUTWARD
}

export interface UpdateIssueLinkRequest {
  linkType?: string;
  direction?: 'OUTWARD' | 'INWARD';
}

// Story Points Interfaces
export interface StoryPointsRequest {
  storyPoints: number; // Story points value (typically 1, 2, 3, 5, 8, 13, etc.)
}

// Gantt Chart Interfaces
export interface GanttTask {
  id: string;
  idReadable: string;
  summary: string;
  description?: string;
  project: {
    id: string;
    name: string;
    shortName: string;
  };
  assignee?: YouTrackUser;
  startDate?: number; // Unix timestamp
  dueDate?: number; // Unix timestamp
  created: number;
  updated: number;
  resolved?: number;
  progress?: number; // 0-100 percentage
  estimation?: {
    minutes: number;
    presentation: string;
  };
  spentTime?: {
    minutes: number;
    presentation: string;
  };
  storyPoints?: number;
  priority?: {
    id: string;
    name: string;
  };
  state?: {
    id: string;
    name: string;
    isResolved?: boolean;
  };
  type?: {
    id: string;
    name: string;
  };
  dependencies: GanttDependency[];
  children: GanttTask[]; // Subtasks
  parent?: string; // Parent task ID
}

export interface GanttDependency {
  id: string;
  type: 'depends_on' | 'blocks' | 'relates_to' | 'subtask_of' | 'parent_of';
  targetTaskId: string;
  targetTaskIdReadable: string;
  linkType: {
    id: string;
    name: string;
    sourceToTarget: string;
    targetToSource: string;
  };
}

export interface GanttMilestone {
  id: string;
  name: string;
  date: number; // Unix timestamp
  description?: string;
  project: {
    id: string;
    name: string;
    shortName: string;
  };
  completed: boolean;
}

export interface GanttChartData {
  project: {
    id: string;
    name: string;
    shortName: string;
  };
  tasks: GanttTask[];
  milestones: GanttMilestone[];
  timeline: {
    startDate: number;
    endDate: number;
    duration: number; // in days
  };
  criticalPath?: string[]; // Array of task IDs
  conflicts: GanttConflict[];
  metadata: {
    generatedAt: number;
    totalTasks: number;
    completedTasks: number;
    overdueTasks: number;
  };
}
export interface GanttConflict {
  type: 'date_overlap' | 'dependency_cycle' | 'missing_dates' | 'resource_conflict';
  taskIds: string[];
  description: string;
  severity: 'low' | 'medium' | 'high';
}

export interface TimelineFilter {
  projectIds?: string[];
  assigneeIds?: string[];
  startDate?: number;
  endDate?: number;
  includeCompleted?: boolean;
  includeSubtasks?: boolean;
  stateNames?: string[];
  priorityNames?: string[];
  typeNames?: string[];
  query?: string; // YouTrack query syntax
}

export interface GanttExportOptions {
  format: 'json' | 'csv' | 'mermaid';
  includeSubtasks?: boolean;
  includeDependencies?: boolean;
  includeMilestones?: boolean;
  dateFormat?: 'iso' | 'timestamp' | 'locale';
  timezone?: string;
}

export interface UpdateTimelineRequest {
  startDate?: number;
  dueDate?: number;
  estimation?: number; // minutes
}

export interface CriticalPathResult {
  path: string[]; // Array of task IDs in critical path order
  duration: number; // Total duration in days
  tasks: Array<{
    id: string;
    idReadable: string;
    summary: string;
    startDate?: number;
    dueDate?: number;
    duration: number;
    slack: number; // Float time in days
  }>;
}
