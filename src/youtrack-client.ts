import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  YouTrackConfig,
  YouTrackUser,
  YouTrackProject,
  YouTrackIssue,
  YouTrackSearchResult,
  CreateIssueRequest,
  UpdateIssueRequest,
  SearchIssuesRequest,
  YouTrackApiError,
  RateLimitInfo,
  YouTrackWorkItem,
  CreateWorkItemRequest,
  UpdateWorkItemRequest,
  TimeTrackingSummary,
  YouTrackIssueLink,
  YouTrackLinkType,
  CreateIssueLinkRequest,
  StoryPointsRequest,
  GanttTask,
  GanttDependency,
  GanttMilestone,
  GanttChartData,
  GanttConflict,
  TimelineFilter,
  UpdateTimelineRequest,
  CriticalPathResult,
  CreateSubtaskRequest,
  SubtaskInfo,
  CreateMultipleSubtasksRequest
} from './types.js';
import { formatApiError, delay, buildDateCustomField, parseDateFieldValue, isStartDateField, isDueDateField } from './utils.js';

/**
 * YouTrack API client with authentication, rate limiting, and error handling
 */
export class YouTrackClient {
  private client: AxiosInstance;
  private config: YouTrackConfig;
  private rateLimitInfo: RateLimitInfo;
  private requestQueue: Array<() => Promise<any>> = [];
  private isProcessingQueue = false;

  constructor(config: YouTrackConfig) {
    this.config = config;
    this.rateLimitInfo = {
      remaining: config.rateLimit || 60,
      resetTime: Date.now() + 60000,
      limit: config.rateLimit || 60
    };

    this.client = axios.create({
      baseURL: `${config.url}/api`,
      timeout: config.timeout || 30000,
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'YouTrack-MCP-Server/1.0.0'
      }
    });

    // Add response interceptor for rate limiting and error enhancement
    this.client.interceptors.response.use(
      (response) => {
        this.updateRateLimitInfo(response.headers);
        return response;
      },
      (error) => {
        if (error.response) {
          this.updateRateLimitInfo(error.response.headers);
          this.handleApiError(error);

          // Enhance error with meaningful message from YouTrack API
          const apiError = error.response.data;
          if (apiError) {
            const errorMessage = apiError.error_description || apiError.error || apiError.message ||
              (typeof apiError === 'string' ? apiError : JSON.stringify(apiError));
            error.message = `YouTrack API Error (${error.response.status}): ${errorMessage}`;
          }
        }
        return Promise.reject(error);
      }
    );
  }

  private updateRateLimitInfo(headers: any): void {
    // YouTrack doesn't provide rate limit headers by default,
    // so we implement our own tracking
    this.rateLimitInfo.remaining = Math.max(0, this.rateLimitInfo.remaining - 1);

    if (Date.now() > this.rateLimitInfo.resetTime) {
      this.rateLimitInfo.remaining = this.rateLimitInfo.limit;
      this.rateLimitInfo.resetTime = Date.now() + 60000;
    }
  }

  private handleApiError(error: AxiosError): void {
    if (this.config.debug) {
      console.error('YouTrack API Error Details:');
      console.error('  Status:', error.response?.status);
      console.error('  URL:', error.config?.url);
      console.error('  Method:', error.config?.method?.toUpperCase());
      console.error('  Request Data:', error.config?.data);
      console.error('  Response Data:', error.response?.data);
    }

    if (error.response?.status === 429) {
      // Rate limited - implement exponential backoff
      const retryAfter = parseInt(error.response.headers['retry-after'] || '60', 10);
      this.rateLimitInfo.resetTime = Date.now() + (retryAfter * 1000);
      this.rateLimitInfo.remaining = 0;
    }
  }

  /**
   * Wrap a promise with a timeout to prevent indefinite hangs
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Operation "${operation}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  private async makeRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    if (this.rateLimitInfo.remaining <= 0 && Date.now() < this.rateLimitInfo.resetTime) {
      // Add to queue if rate limited
      return new Promise((resolve, reject) => {
        this.requestQueue.push(async () => {
          try {
            const result = await requestFn();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
        this.processQueue();
      });
    }

    return requestFn();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0 && this.rateLimitInfo.remaining > 0) {
      const request = this.requestQueue.shift();
      if (request) {
        try {
          await request();
        } catch (error) {
          console.error('Queued request failed:', error);
        }
      }
    }

    this.isProcessingQueue = false;

    // Schedule next processing if queue is not empty
    if (this.requestQueue.length > 0) {
      const waitTime = Math.max(0, this.rateLimitInfo.resetTime - Date.now());
      setTimeout(() => this.processQueue(), waitTime);
    }
  }

  /**
   * Test the connection to YouTrack
   */
  async testConnection(): Promise<boolean> {
    try {
      // Use /users/me instead of /admin/projects - doesn't require admin permissions
      await this.makeRequest(() => this.client.get('/users/me?fields=id'));
      return true;
    } catch (error: any) {
      console.error('Connection test failed:', error.message || error);
      if (error.response?.status === 401) {
        console.error('  → Token is invalid or expired. Please check YOUTRACK_TOKEN.');
      } else if (error.response?.status === 403) {
        console.error('  → Token lacks required permissions.');
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        console.error('  → Cannot reach YouTrack server. Check YOUTRACK_URL.');
      }
      return false;
    }
  }

  /**
   * Get current user information
   */
  async getCurrentUser(): Promise<YouTrackUser> {
    const response = await this.makeRequest(() =>
      this.client.get('/users/me?fields=id,login,fullName,email,avatarUrl,online,banned')
    );
    return response.data;
  }

  /**
   * List all projects
   */
  async getProjects(): Promise<YouTrackProject[]> {
    const response = await this.makeRequest(() =>
      this.client.get('/admin/projects?fields=id,name,shortName,description,leader(id,login,fullName),createdBy(id,login,fullName),updatedBy(id,login,fullName),created,updated,archived')
    );
    return response.data;
  }

  /**
   * Get project by ID or short name
   */
  async getProject(projectId: string): Promise<YouTrackProject> {
    const response = await this.makeRequest(() =>
      this.client.get(`/admin/projects/${projectId}?fields=id,name,shortName,description,leader(id,login,fullName),createdBy(id,login,fullName),updatedBy(id,login,fullName),created,updated,archived`)
    );
    return response.data;
  }

  /**
   * Resolve a project identifier (ID or shortName) to a project ID
   * YouTrack API requires the actual project ID (e.g., "0-1") for issue creation,
   * but users often prefer the shortName (e.g., "QM").
   * This method transparently handles both cases.
   */
  async resolveProjectId(projectIdentifier: string): Promise<string> {
    // If it looks like an ID (contains a dash with numbers), return as-is
    if (/^\d+-\d+$/.test(projectIdentifier)) {
      return projectIdentifier;
    }

    // Otherwise, try to resolve the shortName to an ID
    try {
      const project = await this.getProject(projectIdentifier);
      if (this.config.debug) {
        console.log(`Resolved project shortName "${projectIdentifier}" to ID "${project.id}"`);
      }
      return project.id;
    } catch (error) {
      // If resolution fails, return the original - let the API provide the error
      if (this.config.debug) {
        console.log(`Could not resolve project "${projectIdentifier}", using as-is`);
      }
      return projectIdentifier;
    }
  }

  /**
   * List users
   */
  async getUsers(query?: string, limit = 50): Promise<YouTrackUser[]> {
    const params = new URLSearchParams({
      fields: 'id,login,fullName,email,avatarUrl,online,banned',
      $top: limit.toString()
    });

    if (query) {
      params.append('query', query);
    }

    const response = await this.makeRequest(() =>
      this.client.get(`/users?${params.toString()}`)
    );
    return response.data;
  }

  /**
   * Get user by ID or login
   */
  async getUser(userId: string): Promise<YouTrackUser> {
    const response = await this.makeRequest(() =>
      this.client.get(`/users/${userId}?fields=id,login,fullName,email,avatarUrl,online,banned`)
    );
    return response.data;
  }

  /**
   * Get all accessible custom fields from the server
   * Used for dynamic tool schema generation
   * 
   * Fetches project-level custom field configurations to properly show
   * which values are available in which projects.
   */
  async getAccessibleCustomFields(): Promise<Array<{
    name: string;
    fieldType: { valueType: string };
    instances?: Array<{
      project?: {
        id: string;
        name: string;
        shortName: string;
      };
      bundle?: {
        values?: Array<{
          name: string;
          description?: string;
        }>
      }
    }>;
    defaultBundle?: {
      values?: Array<{
        name: string;
        description?: string;
      }>
    }
  }>> {
    const startTime = Date.now();
    console.error('  → Fetching custom fields from YouTrack API...');

    try {
      const request = this.makeRequest(() =>
        this.client.get('/admin/customFieldSettings/customFields?fields=name,fieldType(valueType),instances(project(id,name,shortName),bundle(values(name,description))),defaultBundle(values(name,description))&$top=500')
      );

      // Apply 15-second timeout to prevent indefinite hangs
      const response = await this.withTimeout(request, 15000, 'getAccessibleCustomFields');

      const elapsed = Date.now() - startTime;
      console.error(`  → Custom fields fetch completed in ${elapsed}ms`);

      return response.data;
    } catch (error: any) {
      const elapsed = Date.now() - startTime;
      console.warn(`Failed to fetch custom fields after ${elapsed}ms:`, error.message || error);
      return [];
    }
  }

  /**
   * Search issues
   */
  async searchIssues(searchRequest: SearchIssuesRequest): Promise<YouTrackSearchResult<YouTrackIssue>> {
    const params = new URLSearchParams({
      fields: 'id,idReadable,summary,description,project(id,name,shortName),reporter(id,login,fullName),updater(id,login,fullName),assignee(id,login,fullName),created,updated,resolved,numberInProject,customFields(id,name,value(id,name,login,fullName),projectCustomField(field(name,fieldType(valueType)))),tags(name)',
      $top: (searchRequest.limit || 50).toString()
    });

    if (searchRequest.skip) {
      params.append('$skip', searchRequest.skip.toString());
    }

    if (searchRequest.query) {
      params.append('query', searchRequest.query);
    }

    const response = await this.makeRequest(() =>
      this.client.get(`/issues?${params.toString()}`)
    );

    // Map each issue to extract assignee from custom fields if needed
    const mappedItems = response.data.map((issue: any) => this.mapIssueResponse(issue));

    return {
      items: mappedItems,
      hasMore: response.data.length === (searchRequest.limit || 50),
      totalCount: response.headers['x-total-count'] ? parseInt(response.headers['x-total-count'], 10) : undefined
    };
  }

  /**
   * Get issue by ID
   */
  async getIssue(issueId: string): Promise<YouTrackIssue> {
    const response = await this.makeRequest(() =>
      this.client.get(`/issues/${issueId}?fields=id,idReadable,summary,description,project(id,name,shortName),reporter(id,login,fullName),updater(id,login,fullName),assignee(id,login,fullName),created,updated,resolved,numberInProject,customFields(id,name,value(id,name,login,fullName,isResolved,localizedName,color(id)),projectCustomField(field(name,fieldType(valueType)))),tags(name),comments(id,text,author(id,login,fullName),created,updated,deleted)`)
    );
    return this.mapIssueResponse(response.data);
  }

  /**
   * Helper function to build custom field objects for YouTrack API
   */
  private buildCustomField(name: string, value: string, type: string): any {
    return {
      name,
      value: { name: value },
      $type: type
    };
  }

  /**
   * Helper function to build user custom field objects for YouTrack API
   */
  private buildUserCustomField(name: string, userId: string): any {
    return {
      name,
      value: { id: userId },
      $type: 'SingleUserIssueCustomField'
    };
  }

  /**
   * Helper function to build date custom field objects for YouTrack API
   */
  private buildDateCustomField(name: string, dateValue: number | string | Date): any {
    return buildDateCustomField(name, dateValue);
  }

  /**
   * Helper function to extract assignee from custom fields
   */
  private extractAssigneeFromCustomFields(customFields?: any[]): any {
    if (!customFields) return null;

    const assigneeField = customFields.find(field => field.name === 'Assignee');
    return assigneeField?.value || null;
  }

  /**
   * Helper function to map issue response and extract assignee from custom fields
   */
  private mapIssueResponse(issueData: any): YouTrackIssue {
    // If the issue.assignee is null but we have an Assignee custom field, use that
    if (!issueData.assignee && issueData.customFields) {
      const assigneeFromCustomField = this.extractAssigneeFromCustomFields(issueData.customFields);
      if (assigneeFromCustomField) {
        issueData.assignee = assigneeFromCustomField;
      }
    }

    return issueData;
  }

  /**
   * Helper function to merge custom fields with priority, state, type, etc.
   */
  private mergeCustomFields(existingFields: Record<string, any> = {}, additionalFields: any[] = []): any[] {
    const customFields: any[] = [];

    // Add existing custom fields from the request
    // Need to properly format with $type for YouTrack API
    Object.entries(existingFields).forEach(([name, value]) => {
      // If value already has $type at its level, it was pre-formatted - need to restructure
      if (value && typeof value === 'object' && value.$type) {
        const { $type, ...rest } = value;
        customFields.push({
          name,
          value: rest,
          $type
        });
      } else {
        // Infer $type based on field name and value type
        let fieldType = 'SingleEnumIssueCustomField'; // default
        let formattedValue = value;

        if (name === 'Estimation' || name === 'Spent time') {
          fieldType = 'PeriodIssueCustomField';
          formattedValue = typeof value === 'object' ? value : { minutes: value };
        } else if (name === 'Story Points') {
          fieldType = 'SimpleIssueCustomField';
          // Story Points value should be directly the number, not wrapped
        } else if (name === 'Assignee') {
          fieldType = 'SingleUserIssueCustomField';
          formattedValue = typeof value === 'string' ? { id: value } : value;
        } else if (name === 'Start Date' || name === 'Due Date' || name.toLowerCase().includes('date')) {
          fieldType = 'DateIssueCustomField';
          formattedValue = typeof value === 'number' ? value : value;
        } else if (name === 'Layer' || name === 'Service' || name === 'Target Scope') {
          // Single-enum fields - include $type in value for project-owned bundles
          fieldType = 'SingleEnumIssueCustomField';
          formattedValue = { name: value, $type: 'EnumBundleElement' };
        } else if (typeof value === 'string') {
          // Other enum fields expect value as { name: <string> }
          formattedValue = { name: value };
        }

        customFields.push({
          name,
          value: formattedValue,
          $type: fieldType
        });
      }
    });

    // Add additional fields (priority, state, type, etc.) - these are already properly formatted
    additionalFields.forEach(field => {
      customFields.push(field);
    });

    return customFields;
  }

  /**
   * Create a new issue
   */
  async createIssue(createRequest: CreateIssueRequest): Promise<YouTrackIssue> {
    // Resolve project shortName to ID if needed
    const projectId = await this.resolveProjectId(createRequest.project);

    const issueData: any = {
      project: { id: projectId },
      summary: createRequest.summary
    };

    if (createRequest.description) {
      issueData.description = createRequest.description;
    }

    // Build additional custom fields for priority, type, and assignee
    const additionalFields: any[] = [];

    if (createRequest.assignee) {
      additionalFields.push(this.buildUserCustomField('Assignee', createRequest.assignee));
    }

    if (createRequest.priority) {
      additionalFields.push(this.buildCustomField('Priority', createRequest.priority, 'SingleEnumIssueCustomField'));
    }

    if (createRequest.type) {
      additionalFields.push(this.buildCustomField('Type', createRequest.type, 'SingleEnumIssueCustomField'));
    }

    // Merge all custom fields
    if (createRequest.customFields || additionalFields.length > 0) {
      issueData.customFields = this.mergeCustomFields(createRequest.customFields, additionalFields);
    }

    if (this.config.debug) {
      console.log('Creating issue with data:', JSON.stringify(issueData, null, 2));
    }

    try {
      const response = await this.makeRequest(() =>
        this.client.post('/issues?fields=id,idReadable,summary,description,project(id,name,shortName),reporter(id,login,fullName),assignee(id,login,fullName),created,updated,numberInProject,customFields(id,name,value(id,name,login,fullName))', issueData)
      );
      return this.mapIssueResponse(response.data);
    } catch (error: any) {
      // Enhanced error logging for debugging
      if (this.config.debug) {
        console.error('Failed to create issue. Request data was:', JSON.stringify(issueData, null, 2));
        if (error.response?.data) {
          console.error('YouTrack API error response:', JSON.stringify(error.response.data, null, 2));
        }
      }
      throw error;
    }
  }

  /**
   * Update an existing issue
   */
  async updateIssue(issueId: string, updateRequest: UpdateIssueRequest): Promise<YouTrackIssue> {
    const updateData: any = {};

    if (updateRequest.summary) {
      updateData.summary = updateRequest.summary;
    }

    if (updateRequest.description !== undefined) {
      updateData.description = updateRequest.description;
    }

    // Build additional custom fields for priority, state, and assignee
    const additionalFields: any[] = [];

    if (updateRequest.assignee) {
      additionalFields.push(this.buildUserCustomField('Assignee', updateRequest.assignee));
    }

    if (updateRequest.priority) {
      additionalFields.push(this.buildCustomField('Priority', updateRequest.priority, 'SingleEnumIssueCustomField'));
    }

    if (updateRequest.state) {
      // Try both 'State' and 'Stage' field names as different YouTrack instances may use different names
      additionalFields.push(this.buildCustomField('Stage', updateRequest.state, 'StateIssueCustomField'));
    }

    // Merge all custom fields
    if (updateRequest.customFields || additionalFields.length > 0) {
      updateData.customFields = this.mergeCustomFields(updateRequest.customFields, additionalFields);
    }

    if (this.config.debug) {
      console.log(`Updating issue ${issueId} with data:`, JSON.stringify(updateData, null, 2));
    }

    const response = await this.makeRequest(() =>
      this.client.post(`/issues/${issueId}?fields=id,idReadable,summary,description,project(id,name,shortName),reporter(id,login,fullName),updater(id,login,fullName),assignee(id,login,fullName),created,updated,resolved,numberInProject,customFields(id,name,value(id,name,login,fullName))`, updateData)
    );
    return this.mapIssueResponse(response.data);
  }

  /**
   * Add comment to an issue
   */
  async addComment(issueId: string, text: string): Promise<void> {
    await this.makeRequest(() =>
      this.client.post(`/issues/${issueId}/comments`, { text })
    );
  }

  /**
   * Delete an issue
   * WARNING: This operation cannot be undone!
   */
  async deleteIssue(issueId: string): Promise<void> {
    await this.makeRequest(() =>
      this.client.delete(`/issues/${issueId}`)
    );
  }

  /**
   * Get rate limit information
   */
  getRateLimitInfo(): RateLimitInfo {
    return { ...this.rateLimitInfo };
  }

  // Time Tracking Methods

  /**
   * Get work items for an issue
   */
  async getWorkItems(issueId: string): Promise<YouTrackWorkItem[]> {
    const response = await this.makeRequest(() =>
      this.client.get(`/issues/${issueId}/timeTracking/workItems?fields=id,author(id,login,fullName),date,duration(id,minutes,presentation),description,type(id,name),created,updated`)
    );
    return response.data || [];
  }

  /**
   * Create a work item for an issue
   */
  async createWorkItem(issueId: string, workItemRequest: CreateWorkItemRequest): Promise<YouTrackWorkItem> {
    const workItemData: any = {
      duration: { minutes: workItemRequest.duration },
      date: workItemRequest.date || Date.now()
    };

    if (workItemRequest.description) {
      workItemData.description = workItemRequest.description;
    }

    if (workItemRequest.type) {
      workItemData.type = { name: workItemRequest.type };
    }

    if (this.config.debug) {
      console.log('Creating work item with data:', JSON.stringify(workItemData, null, 2));
    }

    const response = await this.makeRequest(() =>
      this.client.post(`/issues/${issueId}/timeTracking/workItems?fields=id,author(id,login,fullName),date,duration(id,minutes,presentation),description,type(id,name),created,updated`, workItemData)
    );
    return response.data;
  }

  /**
   * Update a work item
   */
  async updateWorkItem(issueId: string, workItemId: string, workItemRequest: UpdateWorkItemRequest): Promise<YouTrackWorkItem> {
    const updateData: any = {};

    if (workItemRequest.duration !== undefined) {
      updateData.duration = { minutes: workItemRequest.duration };
    }

    if (workItemRequest.date !== undefined) {
      updateData.date = workItemRequest.date;
    }

    if (workItemRequest.description !== undefined) {
      updateData.description = workItemRequest.description;
    }

    if (workItemRequest.type !== undefined) {
      updateData.type = { name: workItemRequest.type };
    }

    if (this.config.debug) {
      console.log('Updating work item with data:', JSON.stringify(updateData, null, 2));
    }

    const response = await this.makeRequest(() =>
      this.client.post(`/issues/${issueId}/timeTracking/workItems/${workItemId}?fields=id,author(id,login,fullName),date,duration(id,minutes,presentation),description,type(id,name),created,updated`, updateData)
    );
    return response.data;
  }

  /**
   * Delete a work item
   */
  async deleteWorkItem(issueId: string, workItemId: string): Promise<void> {
    await this.makeRequest(() =>
      this.client.delete(`/issues/${issueId}/timeTracking/workItems/${workItemId}`)
    );
  }

  /**
   * Get time tracking summary for an issue
   */
  async getTimeTrackingSummary(issueId: string): Promise<TimeTrackingSummary> {
    // Get issue with time tracking fields
    const issueResponse = await this.makeRequest(() =>
      this.client.get(`/issues/${issueId}?fields=customFields(id,name,value(id,name,minutes,presentation),projectCustomField(field(name,fieldType(valueType))))`)
    );

    // Get work items
    const workItems = await this.getWorkItems(issueId);

    const issue = issueResponse.data;
    const summary: TimeTrackingSummary = { workItems };

    // Extract estimation and spent time from custom fields
    if (issue.customFields) {
      for (const field of issue.customFields) {
        if (field.name === 'Estimation' && field.value) {
          summary.estimation = {
            minutes: field.value.minutes || 0,
            presentation: field.value.presentation || '0m'
          };
        } else if (field.name === 'Spent time' && field.value) {
          summary.spentTime = {
            minutes: field.value.minutes || 0,
            presentation: field.value.presentation || '0m'
          };
        }
      }
    }

    return summary;
  }

  /**
   * Set estimation for an issue
   */
  async setEstimation(issueId: string, estimationMinutes: number): Promise<YouTrackIssue> {
    const updateData = {
      customFields: [
        {
          name: 'Estimation',
          value: { minutes: estimationMinutes },
          $type: 'PeriodIssueCustomField'
        }
      ]
    };

    if (this.config.debug) {
      console.log('Setting estimation with data:', JSON.stringify(updateData, null, 2));
    }

    const response = await this.makeRequest(() =>
      this.client.post(`/issues/${issueId}?fields=id,idReadable,summary,description,project(id,name,shortName),reporter(id,login,fullName),updater(id,login,fullName),assignee(id,login,fullName),created,updated,resolved,numberInProject,customFields(id,name,value(id,name,login,fullName,minutes,presentation))`, updateData)
    );
    return this.mapIssueResponse(response.data);
  }

  // Issue Links Methods

  /**
   * Get issue links for an issue
   */
  async getIssueLinks(issueId: string): Promise<YouTrackIssueLink[]> {
    const response = await this.makeRequest(() =>
      this.client.get(`/issues/${issueId}/links?fields=id,direction,linkType(id,name,localizedName,sourceToTarget,targetToSource,directed,aggregation,readOnly),issues(id,idReadable,summary,project(shortName)),trimmedIssues(id,idReadable,summary,project(shortName))`)
    );
    return response.data || [];
  }

  /**
   * Create an issue link
   */
  async createIssueLink(issueId: string, linkRequest: CreateIssueLinkRequest): Promise<YouTrackIssueLink> {
    const direction = linkRequest.direction || 'OUTWARD';

    if (this.config.debug) {
      console.log('Creating issue link:');
      console.log('  Source Issue:', issueId);
      console.log('  Target Issue:', linkRequest.targetIssue);
      console.log('  Link Type:', linkRequest.linkType);
      console.log('  Direction:', direction);
    }

    // Try the commands approach first (simpler and more reliable)
    try {
      return await this.createIssueLinkViaCommands(issueId, linkRequest, direction);
    } catch (commandError) {
      if (this.config.debug) {
        console.log('Commands approach failed, trying direct API approach:', commandError);
      }

      // Fall back to direct API approach
      try {
        return await this.createIssueLinkViaDirectAPI(issueId, linkRequest, direction);
      } catch (directApiError) {
        if (this.config.debug) {
          console.error('Both approaches failed:');
          console.error('  Commands error:', commandError);
          console.error('  Direct API error:', directApiError);
        }

        // Get available link types for better error message
        let availableLinkTypes = '';
        try {
          const linkTypes = await this.getLinkTypes();
          availableLinkTypes = `\n\nAvailable link types: ${linkTypes.map(lt => lt.localizedName || lt.name).join(', ')}`;
        } catch (linkTypesError) {
          availableLinkTypes = '\n\nCould not retrieve available link types.';
        }

        throw new Error(`Failed to create issue link. Commands approach: ${(commandError as Error).message}. Direct API approach: ${(directApiError as Error).message}.${availableLinkTypes}`);
      }
    }
  }

  /**
   * Create issue link using YouTrack commands (preferred method)
   */
  private async createIssueLinkViaCommands(issueId: string, linkRequest: CreateIssueLinkRequest, direction: string): Promise<YouTrackIssueLink> {
    // Map link types and directions to YouTrack command syntax
    const linkTypeMap: Record<string, { outward: string; inward: string }> = {
      'depend': { outward: 'is required for', inward: 'depends on' },
      'depends on': { outward: 'is required for', inward: 'depends on' },
      'blocks': { outward: 'blocks', inward: 'is blocked by' },
      'relates': { outward: 'relates to', inward: 'relates to' },
      'relates to': { outward: 'relates to', inward: 'relates to' },
      'subtask': { outward: 'parent for', inward: 'subtask of' },
      'parent for': { outward: 'parent for', inward: 'subtask of' },
      'subtask of': { outward: 'parent for', inward: 'subtask of' },
      'duplicate': { outward: 'is duplicated by', inward: 'duplicates' },
      'duplicates': { outward: 'is duplicated by', inward: 'duplicates' }
    };

    const linkTypeKey = linkRequest.linkType.toLowerCase();
    const linkMapping = linkTypeMap[linkTypeKey];

    if (!linkMapping) {
      throw new Error(`Unsupported link type for commands approach: ${linkRequest.linkType}`);
    }

    const commandText = direction === 'OUTWARD' ? linkMapping.outward : linkMapping.inward;
    const query = `${commandText} ${linkRequest.targetIssue}`;

    const commandBody = {
      query: query,
      issues: [{ idReadable: issueId }]
    };

    if (this.config.debug) {
      console.log('Using commands approach with query:', query);
      console.log('Command body:', JSON.stringify(commandBody, null, 2));
    }

    await this.makeRequest(() =>
      this.client.post('/commands', commandBody)
    );

    // Get the updated links to return the created link
    const updatedLinks = await this.getIssueLinks(issueId);

    // Find the newly created link
    const createdLink = updatedLinks.find(link => {
      const linkTypeName = (link.linkType.localizedName || link.linkType.name).toLowerCase();
      return (linkTypeName.includes('depend') && linkTypeKey.includes('depend')) ||
        (linkTypeName.includes('block') && linkTypeKey.includes('block')) ||
        (linkTypeName.includes('relate') && linkTypeKey.includes('relate')) ||
        (linkTypeName.includes('subtask') && linkTypeKey.includes('subtask')) ||
        (linkTypeName.includes('parent') && linkTypeKey.includes('parent')) ||
        (linkTypeName.includes('duplicate') && linkTypeKey.includes('duplicate')) &&
        link.direction === direction &&
        link.issues.some(issue => issue.idReadable === linkRequest.targetIssue);
    });

    if (!createdLink) {
      throw new Error('Link was created via commands but could not be retrieved');
    }

    return createdLink;
  }

  /**
   * Create issue link using direct YouTrack API (fallback method)
   */
  private async createIssueLinkViaDirectAPI(issueId: string, linkRequest: CreateIssueLinkRequest, direction: string): Promise<YouTrackIssueLink> {
    // First, get all available link types to resolve the link type name to ID
    const linkTypes = await this.getLinkTypes();

    // Find the link type by name (case-insensitive, check both name and localizedName)
    const linkType = linkTypes.find(lt =>
      lt.name.toLowerCase() === linkRequest.linkType.toLowerCase() ||
      (lt.localizedName && lt.localizedName.toLowerCase() === linkRequest.linkType.toLowerCase())
    );

    if (!linkType) {
      throw new Error(`Link type "${linkRequest.linkType}" not found. Available link types: ${linkTypes.map(lt => lt.localizedName || lt.name).join(', ')}`);
    }

    // Construct the linkId with direction marker
    // For directed link types: append 's' for OUTWARD, 't' for INWARD
    // For undirected link types: use the ID without markers
    let linkId = linkType.id;

    if (linkType.directed) {
      linkId += direction === 'OUTWARD' ? 's' : 't';
    }

    // Prepare the request body according to YouTrack API specification
    const requestBody = {
      id: linkRequest.targetIssue
    };

    if (this.config.debug) {
      console.log('Using direct API approach:');
      console.log('  Link Type:', linkType.name, `(ID: ${linkType.id})`);
      console.log('  Direction:', direction);
      console.log('  Link ID:', linkId);
      console.log('  Request Body:', JSON.stringify(requestBody, null, 2));
    }

    // Use the correct YouTrack API endpoint
    await this.makeRequest(() =>
      this.client.post(`/issues/${issueId}/links/${linkId}/issues?fields=id,idReadable,summary,project(shortName)`, requestBody)
    );

    // Get the updated links to return the created link
    const updatedLinks = await this.getIssueLinks(issueId);

    // Find the newly created link by matching the target issue and link type
    const createdLink = updatedLinks.find(link =>
      link.linkType.id === linkType.id &&
      link.direction === direction &&
      link.issues.some(issue => issue.id === linkRequest.targetIssue || issue.idReadable === linkRequest.targetIssue)
    );

    if (!createdLink) {
      throw new Error('Link was created via direct API but could not be retrieved');
    }

    return createdLink;
  }

  /**
   * Delete an issue link using YouTrack commands
   */
  async deleteIssueLink(issueId: string, linkId: string): Promise<void> {
    // First, get the link details to extract the link type and target issue
    const links = await this.getIssueLinks(issueId);
    const linkToDelete = links.find(link => link.id === linkId);

    if (!linkToDelete) {
      throw new Error(`Link with ID ${linkId} not found for issue ${issueId}`);
    }

    // Extract link type name
    const linkTypeName = linkToDelete.linkType.localizedName || linkToDelete.linkType.name;

    if (this.config.debug) {
      console.log(`Deleting link ${linkId} of type "${linkTypeName}" with direction "${linkToDelete.direction}"`);
      console.log(`Link has ${linkToDelete.issues.length} target issues:`, linkToDelete.issues.map(i => i.idReadable));
    }

    // Check if there are target issues in the main issues array
    if (linkToDelete.issues.length === 0) {
      // Try trimmedIssues as fallback
      if (linkToDelete.trimmedIssues && linkToDelete.trimmedIssues.length > 0) {
        if (this.config.debug) {
          console.log(`Using trimmedIssues as fallback: ${linkToDelete.trimmedIssues.length} issues`);
        }
        for (const targetIssue of linkToDelete.trimmedIssues) {
          await this.deleteIssueLinkViaCommands(issueId, linkTypeName, targetIssue.idReadable, linkToDelete.direction);
        }
      } else {
        // If no target issues found, try to delete the link using a different approach
        // This might be a broken link or a link with no valid targets
        if (this.config.debug) {
          console.log(`No target issues found for link ${linkId}, attempting direct deletion via commands`);
        }

        // Try to use the link type directly without a specific target
        // This is a fallback for broken or empty links
        await this.deleteEmptyLinkViaCommands(issueId, linkTypeName, linkToDelete.direction);
      }
    } else {
      // For each target issue in the link, remove the link using commands
      for (const targetIssue of linkToDelete.issues) {
        await this.deleteIssueLinkViaCommands(issueId, linkTypeName, targetIssue.idReadable, linkToDelete.direction);
      }
    }
  }

  /**
   * Delete issue link using YouTrack commands
   */
  private async deleteIssueLinkViaCommands(issueId: string, linkTypeName: string, targetIssueId: string, direction: string): Promise<void> {
    // Map link types to YouTrack command syntax based on the command reference
    // The commands use the exact names from the YouTrack command reference
    const linkTypeMap: Record<string, { outward: string; inward: string }> = {
      'depend': { outward: 'is required for', inward: 'depends on' },
      'depends on': { outward: 'is required for', inward: 'depends on' },
      'blocks': { outward: 'blocks', inward: 'is blocked by' },
      'relates to': { outward: 'relates to', inward: 'relates to' },
      'relates': { outward: 'relates to', inward: 'relates to' },
      'parent for': { outward: 'parent for', inward: 'subtask of' },
      'subtask of': { outward: 'subtask of', inward: 'parent for' },
      'subtask': { outward: 'parent for', inward: 'subtask of' },
      'duplicates': { outward: 'duplicates', inward: 'is duplicated by' },
      'duplicate': { outward: 'duplicates', inward: 'is duplicated by' },
      'is duplicated by': { outward: 'is duplicated by', inward: 'duplicates' }
    };

    const linkTypeKey = linkTypeName.toLowerCase();
    const linkMapping = linkTypeMap[linkTypeKey];

    let commandText: string;
    if (linkMapping) {
      // Use mapped command text based on direction
      commandText = direction === 'OUTWARD' ? linkMapping.outward : linkMapping.inward;
    } else {
      // For custom link types, try to use the link type name directly
      // But first try some common variations
      if (linkTypeKey.includes('depend')) {
        commandText = direction === 'OUTWARD' ? 'is required for' : 'depends on';
      } else if (linkTypeKey.includes('block')) {
        commandText = direction === 'OUTWARD' ? 'blocks' : 'is blocked by';
      } else if (linkTypeKey.includes('relate')) {
        commandText = 'relates to';
      } else if (linkTypeKey.includes('parent')) {
        commandText = direction === 'OUTWARD' ? 'parent for' : 'subtask of';
      } else if (linkTypeKey.includes('subtask')) {
        commandText = direction === 'OUTWARD' ? 'subtask of' : 'parent for';
      } else if (linkTypeKey.includes('duplicate')) {
        commandText = direction === 'OUTWARD' ? 'duplicates' : 'is duplicated by';
      } else {
        // Last resort: use the link type name as-is
        commandText = linkTypeName.toLowerCase();
      }
    }

    const query = `remove ${commandText} ${targetIssueId}`;

    const commandBody = {
      query: query,
      issues: [{ idReadable: issueId }]
    };

    if (this.config.debug) {
      console.log('Deleting issue link using commands approach with query:', query);
      console.log('Command body:', JSON.stringify(commandBody, null, 2));
    }

    await this.makeRequest(() =>
      this.client.post('/commands', commandBody)
    );
  }

  /**
   * Delete empty or broken issue link using YouTrack commands
   */
  private async deleteEmptyLinkViaCommands(issueId: string, linkTypeName: string, direction: string): Promise<void> {
    // For empty links, we can try to remove all links of this type
    // This is a more aggressive approach for cleaning up broken links

    const linkTypeKey = linkTypeName.toLowerCase();

    // Use the same mapping as the main deletion method
    const linkTypeMap: Record<string, { outward: string; inward: string }> = {
      'depend': { outward: 'is required for', inward: 'depends on' },
      'depends on': { outward: 'is required for', inward: 'depends on' },
      'blocks': { outward: 'blocks', inward: 'is blocked by' },
      'relates to': { outward: 'relates to', inward: 'relates to' },
      'relates': { outward: 'relates to', inward: 'relates to' },
      'parent for': { outward: 'parent for', inward: 'subtask of' },
      'subtask of': { outward: 'subtask of', inward: 'parent for' },
      'subtask': { outward: 'parent for', inward: 'subtask of' },
      'duplicates': { outward: 'duplicates', inward: 'is duplicated by' },
      'duplicate': { outward: 'duplicates', inward: 'is duplicated by' },
      'is duplicated by': { outward: 'is duplicated by', inward: 'duplicates' }
    };

    const linkMapping = linkTypeMap[linkTypeKey];
    let commandText: string;

    if (linkMapping) {
      commandText = direction === 'OUTWARD' ? linkMapping.outward : linkMapping.inward;
    } else {
      // Use the same fallback logic as the main method
      if (linkTypeKey.includes('depend')) {
        commandText = direction === 'OUTWARD' ? 'is required for' : 'depends on';
      } else if (linkTypeKey.includes('block')) {
        commandText = direction === 'OUTWARD' ? 'blocks' : 'is blocked by';
      } else if (linkTypeKey.includes('relate')) {
        commandText = 'relates to';
      } else if (linkTypeKey.includes('parent')) {
        commandText = direction === 'OUTWARD' ? 'parent for' : 'subtask of';
      } else if (linkTypeKey.includes('subtask')) {
        commandText = direction === 'OUTWARD' ? 'subtask of' : 'parent for';
      } else if (linkTypeKey.includes('duplicate')) {
        commandText = direction === 'OUTWARD' ? 'duplicates' : 'is duplicated by';
      } else {
        commandText = linkTypeName.toLowerCase();
      }
    }

    // Try to remove all links of this type (this is a more general approach)
    const query = `remove ${commandText}`;

    const commandBody = {
      query: query,
      issues: [{ idReadable: issueId }]
    };

    if (this.config.debug) {
      console.log('Deleting empty/broken link using general removal command:', query);
      console.log('Command body:', JSON.stringify(commandBody, null, 2));
    }

    try {
      await this.makeRequest(() =>
        this.client.post('/commands', commandBody)
      );
    } catch (error) {
      if (this.config.debug) {
        console.log('General removal failed, this might be expected for empty links:', error);
      }
      // For empty links, the removal might fail, which is acceptable
      // The link might already be in an inconsistent state
    }
  }

  /**
   * Get available link types for a project
   */
  async getLinkTypes(projectId?: string): Promise<YouTrackLinkType[]> {
    const fields = 'fields=id,name,localizedName,sourceToTarget,targetToSource,directed,aggregation,readOnly';

    // Try different endpoints in order of preference
    const endpoints = projectId
      ? [
        `/admin/projects/${projectId}/issueLinkTypes?${fields}`,
        `/issueLinkTypes?${fields}`,
        `/admin/issueLinkTypes?${fields}`
      ]
      : [
        `/issueLinkTypes?${fields}`,
        `/admin/issueLinkTypes?${fields}`
      ];

    let lastError: any;

    for (const endpoint of endpoints) {
      try {
        if (this.config.debug) {
          console.log(`Trying to get link types from: ${endpoint}`);
        }

        const response = await this.makeRequest(() => this.client.get(endpoint));

        if (this.config.debug) {
          console.log(`Successfully retrieved ${response.data?.length || 0} link types from: ${endpoint}`);
        }

        return response.data || [];
      } catch (error: any) {
        lastError = error;
        if (this.config.debug) {
          console.log(`Failed to get link types from ${endpoint}:`, error.response?.status, error.message);
        }
        continue;
      }
    }

    // If all endpoints failed, throw the last error
    throw new Error(`Failed to retrieve link types from all available endpoints. Last error: ${lastError?.message || 'Unknown error'}`);
  }

  // Subtask Management Methods

  /**
   * Find an appropriate subtask link type from available link types
   */
  private async findSubtaskLinkType(): Promise<{ linkType: string; direction: 'OUTWARD' | 'INWARD' }> {
    try {
      const linkTypes = await this.getLinkTypes();

      if (this.config.debug) {
        console.log('Available link types:', linkTypes.map(lt => `${lt.name} (${lt.localizedName || 'no localized name'})`));
      }

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

      for (const pattern of subtaskPatterns) {
        const linkType = linkTypes.find(lt =>
          (lt.name && lt.name.toLowerCase().includes(pattern)) ||
          (lt.localizedName && lt.localizedName.toLowerCase().includes(pattern))
        );

        if (linkType) {
          const linkTypeName = linkType.localizedName || linkType.name;

          // Determine the correct direction based on the link type name and its properties
          let direction: 'OUTWARD' | 'INWARD' = 'OUTWARD';

          // For YouTrack's "Subtask" link type:
          // - Source → Target: "parent for" (parent links OUTWARD to subtask)
          // - Target → Source: "subtask of" (subtask links INWARD to parent)
          // Since we're creating from parent to subtask, we want OUTWARD

          if (linkTypeName.toLowerCase() === 'subtask') {
            // For the standard "Subtask" link type, parent links OUTWARD to subtask
            direction = 'OUTWARD';
          } else if (linkTypeName.toLowerCase().includes('subtask of') ||
            linkTypeName.toLowerCase().includes('child of')) {
            // For "subtask of" links, parent should link OUTWARD to subtask
            direction = 'OUTWARD';
          } else if (linkTypeName.toLowerCase().includes('parent for') ||
            linkTypeName.toLowerCase().includes('parent of')) {
            // For "parent for" links, parent should link OUTWARD to subtask
            direction = 'OUTWARD';
          }

          if (this.config.debug) {
            console.log(`Found subtask link type: ${linkTypeName} with direction: ${direction}`);
          }

          return { linkType: linkTypeName, direction };
        }
      }

      // If no subtask-specific link type found, try generic relationship types
      const relationshipPatterns = ['relates to', 'related to', 'relates', 'related'];

      for (const pattern of relationshipPatterns) {
        const linkType = linkTypes.find(lt =>
          (lt.name && lt.name.toLowerCase().includes(pattern)) ||
          (lt.localizedName && lt.localizedName.toLowerCase().includes(pattern))
        );

        if (linkType) {
          const linkTypeName = linkType.localizedName || linkType.name;

          if (this.config.debug) {
            console.log(`Using fallback relationship link type: ${linkTypeName}`);
          }

          return { linkType: linkTypeName, direction: 'OUTWARD' };
        }
      }

      throw new Error(`No suitable subtask or relationship link type found. Available link types: ${linkTypes.map(lt => lt.localizedName || lt.name).join(', ')}`);

    } catch (error: any) {
      if (this.config.debug) {
        console.error('Error finding subtask link type:', error);
      }
      throw new Error(`Failed to find subtask link type: ${error.message}`);
    }
  }

  /**
   * Create a subtask and link it to a parent issue
   */
  async createSubtask(request: CreateSubtaskRequest): Promise<{ subtask: YouTrackIssue; link: YouTrackIssueLink }> {
    // Get the parent issue to inherit project
    const parentIssue = await this.getIssue(request.parentIssueId);

    // Build custom fields properly with $type at the correct level
    // Note: We need to handle Estimation and Story Points separately since
    // they need to be added as additionalFields to avoid format issues
    const baseCustomFields = request.customFields ? { ...request.customFields } : {};

    // Create the subtask issue first (without estimation/storyPoints in customFields)
    // Note: Type field is optional - some projects may not have it configured
    const createRequest: CreateIssueRequest = {
      project: parentIssue.project.id,
      summary: request.summary,
      description: request.description,
      assignee: request.assignee,
      priority: request.priority,
      type: request.type,
      customFields: Object.keys(baseCustomFields).length > 0 ? baseCustomFields : undefined
    };

    let subtask: YouTrackIssue;
    try {
      subtask = await this.createIssue(createRequest);
    } catch (error: any) {
      // If the error is related to the Type field not being available, retry without it
      const errorMessage = error.response?.data?.error_description || error.message || '';
      if (errorMessage.includes('incompatible') && errorMessage.toLowerCase().includes('type')) {
        if (this.config.debug) {
          console.log('Type field not available in project, retrying without type...');
        }
        // Retry without type field
        const retryRequest = { ...createRequest, type: undefined };
        subtask = await this.createIssue(retryRequest);
      } else {
        throw error;
      }
    }

    // Update estimation and story points after creation if provided
    // This uses proper $type formatting at the custom field level
    let updatedSubtask = subtask;
    if (request.estimationMinutes !== undefined || request.storyPoints !== undefined) {
      const updateFields: any[] = [];

      if (request.estimationMinutes !== undefined) {
        updateFields.push({
          name: 'Estimation',
          value: { minutes: request.estimationMinutes },
          $type: 'PeriodIssueCustomField'
        });
      }

      if (request.storyPoints !== undefined) {
        updateFields.push({
          name: 'Story Points',
          value: request.storyPoints,
          $type: 'SimpleIssueCustomField'
        });
      }

      if (updateFields.length > 0) {
        const response = await this.makeRequest(() =>
          this.client.post(`/issues/${subtask.idReadable}?fields=id,idReadable,summary,description,project(id,name,shortName),reporter(id,login,fullName),assignee(id,login,fullName),created,updated,numberInProject,customFields(id,name,value(id,name,login,fullName,minutes,presentation))`,
            { customFields: updateFields })
        );
        updatedSubtask = this.mapIssueResponse(response.data);
      }
    }

    // Find an appropriate subtask link type dynamically
    const { linkType, direction } = await this.findSubtaskLinkType();

    // Create the subtask link - parent links to subtask
    const link = await this.createIssueLink(request.parentIssueId, {
      linkType: linkType,
      targetIssue: updatedSubtask.idReadable,
      direction: direction
    });

    return { subtask: updatedSubtask, link };
  }

  /**
   * Get all subtasks of a parent issue
   */
  async getSubtasks(parentIssueId: string, includeCompleted: boolean = false): Promise<SubtaskInfo[]> {
    const links = await this.getIssueLinks(parentIssueId);

    // Collect all subtask issue IDs first
    const subtaskIssueIds: string[] = [];

    for (const link of links) {
      const linkTypeName = (link.linkType.localizedName || link.linkType.name).toLowerCase();

      // Determine if this link represents a parent-child relationship where current issue is parent
      let isParentChildLink = false;

      if (linkTypeName.includes('subtask')) {
        // Based on QM-3/QM-81 debug: QM-81 (parent) has OUTWARD link with QM-3 in issues
        // For getSubtasks, we want OUTWARD links (current issue is parent, linked issues are subtasks)
        isParentChildLink = (link.direction === 'OUTWARD');
      } else if (linkTypeName.includes('parent')) {
        // For "Parent for" links:
        // - OUTWARD direction means current issue is parent of target
        // - INWARD direction means target issue is parent of current
        isParentChildLink = (link.direction === 'OUTWARD');
      }

      if (isParentChildLink) {
        for (const linkedIssue of link.issues) {
          if (linkedIssue.idReadable !== parentIssueId) {
            subtaskIssueIds.push(linkedIssue.idReadable);
          }
        }
      }
    }

    if (subtaskIssueIds.length === 0) {
      return [];
    }

    // Fetch all subtask details in parallel (with concurrency limit to avoid rate limiting)
    const CONCURRENCY_LIMIT = 5;
    const subtasks: SubtaskInfo[] = [];

    for (let i = 0; i < subtaskIssueIds.length; i += CONCURRENCY_LIMIT) {
      const batch = subtaskIssueIds.slice(i, i + CONCURRENCY_LIMIT);
      const batchResults = await Promise.all(
        batch.map(async (issueId) => {
          try {
            const fullIssue = await this.getIssue(issueId);
            return fullIssue;
          } catch (error) {
            if (this.config.debug) {
              console.error(`Failed to fetch subtask ${issueId}:`, error);
            }
            return null;
          }
        })
      );

      for (const fullIssue of batchResults) {
        if (!fullIssue) continue;

        // Check if we should include completed issues
        const isCompleted = fullIssue.customFields?.find(f => f.name.toLowerCase() === 'state')?.value?.isResolved || false;
        if (!includeCompleted && isCompleted) {
          continue;
        }

        // Extract relevant information
        const subtaskInfo: SubtaskInfo = {
          id: fullIssue.id,
          idReadable: fullIssue.idReadable,
          summary: fullIssue.summary,
          description: fullIssue.description,
          assignee: fullIssue.assignee,
          created: fullIssue.created,
          updated: fullIssue.updated,
          resolved: fullIssue.resolved,
          parentIssue: {
            id: parentIssueId,
            idReadable: parentIssueId,
            summary: '' // Will be filled if needed
          }
        };

        // Extract custom field information
        if (fullIssue.customFields) {
          for (const field of fullIssue.customFields) {
            const fieldName = field.name.toLowerCase();

            if (fieldName === 'priority' && field.value) {
              subtaskInfo.priority = { id: field.value.id || '', name: field.value.name || field.value };
            } else if (fieldName === 'state' && field.value) {
              subtaskInfo.state = {
                id: field.value.id || '',
                name: field.value.name || field.value,
                isResolved: field.value.isResolved || false
              };
            } else if (fieldName === 'type' && field.value) {
              subtaskInfo.type = { id: field.value.id || '', name: field.value.name || field.value };
            } else if (fieldName === 'estimation' && field.value) {
              subtaskInfo.estimation = {
                minutes: field.value.minutes || 0,
                presentation: field.value.presentation || '0m'
              };
            } else if (fieldName === 'spent time' && field.value) {
              subtaskInfo.spentTime = {
                minutes: field.value.minutes || 0,
                presentation: field.value.presentation || '0m'
              };
            } else if (fieldName === 'story points' && field.value) {
              subtaskInfo.storyPoints = typeof field.value === 'number' ? field.value : parseInt(field.value.toString(), 10);
            }
          }
        }

        subtasks.push(subtaskInfo);
      }
    }

    return subtasks;
  }

  /**
   * Get the parent issue of a subtask
   */
  async getParentIssue(subtaskIssueId: string): Promise<YouTrackIssue | null> {
    const links = await this.getIssueLinks(subtaskIssueId);

    for (const link of links) {
      const linkTypeName = (link.linkType.localizedName || link.linkType.name).toLowerCase();

      // Determine if this link represents a parent-child relationship where current issue is subtask
      let isSubtaskParentLink = false;

      if (linkTypeName.includes('subtask')) {
        // Based on QM-3/QM-81 debug: QM-3 (subtask) has INWARD link with QM-81 in issues
        // For getParentIssue, we want INWARD links (current issue is subtask, linked issues are parents)
        isSubtaskParentLink = (link.direction === 'INWARD');
      } else if (linkTypeName.includes('parent')) {
        // For "Parent for" links:
        // - OUTWARD direction means current issue is parent of target
        // - INWARD direction means target issue is parent of current
        isSubtaskParentLink = (link.direction === 'INWARD');
      }

      if (isSubtaskParentLink) {
        for (const linkedIssue of link.issues) {
          if (linkedIssue.idReadable !== subtaskIssueId) {
            // Return the parent issue
            return await this.getIssue(linkedIssue.idReadable);
          }
        }
      }
    }

    return null;
  }

  /**
   * Create multiple subtasks for a parent issue
   */
  async createMultipleSubtasks(request: CreateMultipleSubtasksRequest): Promise<Array<{
    success: boolean;
    subtask?: YouTrackIssue;
    link?: YouTrackIssueLink;
    summary: string;
    error?: string;
  }>> {
    const results: Array<{
      success: boolean;
      subtask?: YouTrackIssue;
      link?: YouTrackIssueLink;
      summary: string;
      error?: string;
    }> = [];

    // Verify parent issue exists first
    try {
      await this.getIssue(request.parentIssueId);
    } catch (error: any) {
      // If parent doesn't exist, fail all subtasks
      return request.subtasks.map(subtask => ({
        success: false,
        summary: subtask.summary,
        error: `Parent issue ${request.parentIssueId} not found: ${error.message}`
      }));
    }

    // Create subtasks in parallel batches (limit concurrency to avoid rate limiting)
    const CONCURRENCY_LIMIT = 3;

    for (let i = 0; i < request.subtasks.length; i += CONCURRENCY_LIMIT) {
      const batch = request.subtasks.slice(i, i + CONCURRENCY_LIMIT);

      const batchResults = await Promise.all(
        batch.map(async (subtaskData) => {
          try {
            const subtaskRequest: CreateSubtaskRequest = {
              parentIssueId: request.parentIssueId,
              summary: subtaskData.summary,
              description: subtaskData.description,
              assignee: subtaskData.assignee,
              priority: subtaskData.priority,
              type: subtaskData.type,
              estimationMinutes: subtaskData.estimationMinutes,
              storyPoints: subtaskData.storyPoints,
              customFields: subtaskData.customFields
            };

            const result = await this.createSubtask(subtaskRequest);

            return {
              success: true,
              subtask: result.subtask,
              link: result.link,
              summary: subtaskData.summary
            };
          } catch (error: any) {
            return {
              success: false,
              summary: subtaskData.summary,
              error: error.message
            };
          }
        })
      );

      results.push(...batchResults);

      // Small delay between batches to be respectful of rate limits
      if (i + CONCURRENCY_LIMIT < request.subtasks.length) {
        await delay(100);
      }
    }

    return results;
  }

  // Story Points Methods

  /**
   * Set story points for an issue
   */
  async setStoryPoints(issueId: string, storyPoints: number): Promise<YouTrackIssue> {
    const updateData = {
      customFields: [
        {
          name: 'Story Points',
          value: storyPoints,
          $type: 'SimpleIssueCustomField'
        }
      ]
    };

    if (this.config.debug) {
      console.log('Setting story points with data:', JSON.stringify(updateData, null, 2));
    }

    const response = await this.makeRequest(() =>
      this.client.post(`/issues/${issueId}?fields=id,idReadable,summary,description,project(id,name,shortName),reporter(id,login,fullName),updater(id,login,fullName),assignee(id,login,fullName),created,updated,resolved,numberInProject,customFields(id,name,value)`, updateData)
    );
    return this.mapIssueResponse(response.data);
  }

  /**
   * Get story points for an issue
   */
  async getStoryPoints(issueId: string): Promise<number | null> {
    const issue = await this.getIssue(issueId);

    if (issue.customFields) {
      const storyPointsField = issue.customFields.find(field => field.name === 'Story Points');
      if (storyPointsField && storyPointsField.value) {
        return typeof storyPointsField.value === 'number' ? storyPointsField.value : parseInt(storyPointsField.value.toString(), 10);
      }
    }

    return null;
  }

  // Gantt Chart Methods

  /**
   * Get Gantt chart data for a project or filtered set of issues
   */
  async getGanttData(filter: TimelineFilter): Promise<GanttChartData> {
    // Build search query based on filter - simplified approach
    let query = '';
    const queryParts: string[] = [];

    if (filter.projectIds && filter.projectIds.length > 0) {
      // Assume project IDs are actually short names for simplicity
      queryParts.push(`project: {${filter.projectIds.join(', ')}}`);
    }

    if (filter.assigneeIds && filter.assigneeIds.length > 0) {
      queryParts.push(`assignee: {${filter.assigneeIds.join(', ')}}`);
    }

    if (filter.stateNames && filter.stateNames.length > 0) {
      queryParts.push(`State: {${filter.stateNames.join(', ')}}`);
    }

    if (filter.priorityNames && filter.priorityNames.length > 0) {
      queryParts.push(`Priority: {${filter.priorityNames.join(', ')}}`);
    }

    if (filter.typeNames && filter.typeNames.length > 0) {
      queryParts.push(`Type: {${filter.typeNames.join(', ')}}`);
    }

    if (filter.startDate) {
      queryParts.push(`created: ${filter.startDate}..`);
    }

    if (filter.endDate) {
      queryParts.push(`created: ..${filter.endDate}`);
    }

    if (!filter.includeCompleted) {
      queryParts.push(`#Unresolved`);
    }

    if (filter.query) {
      queryParts.push(filter.query);
    }

    query = queryParts.join(' ');

    // Search for issues with comprehensive fields including custom fields for dates
    const searchResult = await this.searchIssues({
      query: query || undefined,
      limit: 100 // Conservative limit to avoid timeouts
    });

    const tasks: GanttTask[] = [];
    const milestones: GanttMilestone[] = [];
    let projectInfo: any = null;

    // Limit processing to avoid timeouts
    const issuesToProcess = searchResult.items.slice(0, 50);

    for (const issue of issuesToProcess) {
      try {
        // Convert issue to GanttTask with simplified approach - disable dependency retrieval for performance
        const ganttTask = await this.convertIssueToGanttTaskSimplified(issue);
        tasks.push(ganttTask);

        // Set project info from first issue if not set
        if (!projectInfo) {
          projectInfo = issue.project;
        }
      } catch (error: any) {
        // Skip issues that can't be converted
        if (this.config.debug) {
          console.log(`Skipping issue ${issue.idReadable}: ${error.message}`);
        }
      }
    }

    // Calculate timeline
    const timeline = this.calculateTimeline(tasks);

    // Detect conflicts
    const conflicts = this.detectConflicts(tasks);

    // Calculate metadata
    const metadata = {
      generatedAt: Date.now(),
      totalTasks: tasks.length,
      completedTasks: tasks.filter(task => task.state?.isResolved).length,
      overdueTasks: tasks.filter(task =>
        task.dueDate && task.dueDate < Date.now() && !task.state?.isResolved
      ).length
    };

    return {
      project: projectInfo || { id: '', name: 'Multiple Projects', shortName: 'MULTI' },
      tasks,
      milestones,
      timeline,
      conflicts,
      metadata
    };
  }

  /**
   * Convert a YouTrack issue to a Gantt task (simplified version without dependencies)
   */
  private async convertIssueToGanttTaskSimplified(issue: YouTrackIssue): Promise<GanttTask> {
    // Extract dates from custom fields
    let startDate: number | undefined;
    let dueDate: number | undefined;
    let estimation: { minutes: number; presentation: string } | undefined;
    let spentTime: { minutes: number; presentation: string } | undefined;
    let storyPoints: number | undefined;
    let priority: { id: string; name: string } | undefined;
    let state: { id: string; name: string; isResolved?: boolean } | undefined;
    let type: { id: string; name: string } | undefined;

    if (issue.customFields) {
      for (const field of issue.customFields) {
        const fieldName = field.name.toLowerCase();

        // Date fields - use improved date parsing
        if (isStartDateField(fieldName)) {
          const parsedDate = parseDateFieldValue(field.value);
          if (parsedDate) {
            startDate = parsedDate;
            if (this.config.debug) {
              console.log(`Parsed start date for ${issue.idReadable}: ${new Date(startDate).toISOString()}`);
            }
          }
        } else if (isDueDateField(fieldName)) {
          const parsedDate = parseDateFieldValue(field.value);
          if (parsedDate) {
            dueDate = parsedDate;
            if (this.config.debug) {
              console.log(`Parsed due date for ${issue.idReadable}: ${new Date(dueDate).toISOString()}`);
            }
          }
        }

        // Time tracking fields
        else if (fieldName === 'estimation' && field.value) {
          estimation = {
            minutes: field.value.minutes || 0,
            presentation: field.value.presentation || '0m'
          };
        } else if (fieldName === 'spent time' && field.value) {
          spentTime = {
            minutes: field.value.minutes || 0,
            presentation: field.value.presentation || '0m'
          };
        }

        // Story points
        else if (fieldName === 'story points' && field.value) {
          storyPoints = typeof field.value === 'number' ? field.value : parseInt(field.value.toString(), 10);
        }

        // Priority, State, Type
        else if (fieldName === 'priority' && field.value) {
          priority = { id: field.value.id || '', name: field.value.name || field.value };
        } else if ((fieldName === 'state' || fieldName === 'stage') && field.value) {
          state = {
            id: field.value.id || '',
            name: field.value.name || field.value,
            isResolved: field.value.isResolved || false
          };
        } else if (fieldName === 'type' && field.value) {
          type = { id: field.value.id || '', name: field.value.name || field.value };
        }
      }
    }

    // Calculate progress based on state and time tracking
    let progress = 0;
    if (state?.isResolved) {
      progress = 100;
    } else if (spentTime && estimation && estimation.minutes > 0) {
      progress = Math.min(100, (spentTime.minutes / estimation.minutes) * 100);
    }

    return {
      id: issue.id,
      idReadable: issue.idReadable,
      summary: issue.summary,
      description: issue.description,
      project: {
        id: issue.project.id,
        name: issue.project.name,
        shortName: issue.project.shortName
      },
      assignee: issue.assignee,
      startDate,
      dueDate,
      created: issue.created,
      updated: issue.updated,
      resolved: issue.resolved,
      progress,
      estimation,
      spentTime,
      storyPoints,
      priority,
      state,
      type,
      dependencies: [], // Empty for performance
      children: []
    };
  }

  /**
   * Convert a YouTrack issue to a Gantt task
   */
  private async convertIssueToGanttTask(issue: YouTrackIssue, includeSubtasks: boolean): Promise<GanttTask> {
    // Extract dates from custom fields
    let startDate: number | undefined;
    let dueDate: number | undefined;
    let estimation: { minutes: number; presentation: string } | undefined;
    let spentTime: { minutes: number; presentation: string } | undefined;
    let storyPoints: number | undefined;
    let priority: { id: string; name: string } | undefined;
    let state: { id: string; name: string; isResolved?: boolean } | undefined;
    let type: { id: string; name: string } | undefined;

    if (issue.customFields) {
      for (const field of issue.customFields) {
        const fieldName = field.name.toLowerCase();

        // Date fields - use improved date parsing
        if (isStartDateField(fieldName)) {
          const parsedDate = parseDateFieldValue(field.value);
          if (parsedDate) {
            startDate = parsedDate;
            if (this.config.debug) {
              console.log(`Parsed start date for ${issue.idReadable}: ${new Date(startDate).toISOString()}`);
            }
          }
        } else if (isDueDateField(fieldName)) {
          const parsedDate = parseDateFieldValue(field.value);
          if (parsedDate) {
            dueDate = parsedDate;
            if (this.config.debug) {
              console.log(`Parsed due date for ${issue.idReadable}: ${new Date(dueDate).toISOString()}`);
            }
          }
        }

        // Time tracking fields
        else if (fieldName === 'estimation' && field.value) {
          estimation = {
            minutes: field.value.minutes || 0,
            presentation: field.value.presentation || '0m'
          };
        } else if (fieldName === 'spent time' && field.value) {
          spentTime = {
            minutes: field.value.minutes || 0,
            presentation: field.value.presentation || '0m'
          };
        }

        // Story points
        else if (fieldName === 'story points' && field.value) {
          storyPoints = typeof field.value === 'number' ? field.value : parseInt(field.value.toString(), 10);
        }

        // Priority, State, Type
        else if (fieldName === 'priority' && field.value) {
          priority = { id: field.value.id || '', name: field.value.name || field.value };
        } else if ((fieldName === 'state' || fieldName === 'stage') && field.value) {
          state = {
            id: field.value.id || '',
            name: field.value.name || field.value,
            isResolved: field.value.isResolved || false
          };
        } else if (fieldName === 'type' && field.value) {
          type = { id: field.value.id || '', name: field.value.name || field.value };
        }
      }
    }

    // Get dependencies from issue links
    const dependencies = await this.getIssueDependenciesForGantt(issue.idReadable);

    // Calculate progress based on state and time tracking
    let progress = 0;
    if (state?.isResolved) {
      progress = 100;
    } else if (spentTime && estimation && estimation.minutes > 0) {
      progress = Math.min(100, (spentTime.minutes / estimation.minutes) * 100);
    }

    // Simplified subtask handling to avoid infinite loops
    let children: GanttTask[] = [];
    // Disable subtask processing for now to avoid complexity and potential hangs
    // if (includeSubtasks) {
    //   // Subtask processing disabled for stability
    // }

    return {
      id: issue.id,
      idReadable: issue.idReadable,
      summary: issue.summary,
      description: issue.description,
      project: {
        id: issue.project.id,
        name: issue.project.name,
        shortName: issue.project.shortName
      },
      assignee: issue.assignee,
      startDate,
      dueDate,
      created: issue.created,
      updated: issue.updated,
      resolved: issue.resolved,
      progress,
      estimation,
      spentTime,
      storyPoints,
      priority,
      state,
      type,
      dependencies,
      children
    };
  }
  /**
   * Get issue dependencies formatted for Gantt charts
   */
  private async getIssueDependenciesForGantt(issueId: string): Promise<GanttDependency[]> {
    try {
      const links = await this.getIssueLinks(issueId);
      const dependencies: GanttDependency[] = [];

      for (const link of links) {
        const linkTypeName = link.linkType.name.toLowerCase();
        let dependencyType: GanttDependency['type'];

        if (linkTypeName.includes('depend')) {
          dependencyType = link.direction === 'OUTWARD' ? 'depends_on' : 'blocks';
        } else if (linkTypeName.includes('block')) {
          dependencyType = link.direction === 'OUTWARD' ? 'blocks' : 'depends_on';
        } else if (linkTypeName.includes('subtask')) {
          dependencyType = 'subtask_of';
        } else if (linkTypeName.includes('parent')) {
          dependencyType = 'parent_of';
        } else {
          dependencyType = 'relates_to';
        }

        for (const targetIssue of link.issues) {
          if (targetIssue.idReadable !== issueId) {
            dependencies.push({
              id: link.id,
              type: dependencyType,
              targetTaskId: targetIssue.id,
              targetTaskIdReadable: targetIssue.idReadable,
              linkType: {
                id: link.linkType.id,
                name: link.linkType.name,
                sourceToTarget: link.linkType.sourceToTarget,
                targetToSource: link.linkType.targetToSource
              }
            });
          }
        }
      }

      return dependencies;
    } catch (error) {
      // Return empty array if links can't be retrieved
      return [];
    }
  }

  /**
   * Calculate timeline from tasks
   */
  private calculateTimeline(tasks: GanttTask[]): { startDate: number; endDate: number; duration: number } {
    if (tasks.length === 0) {
      const now = Date.now();
      return { startDate: now, endDate: now, duration: 0 };
    }

    let earliestStart = Number.MAX_SAFE_INTEGER;
    let latestEnd = 0;

    for (const task of tasks) {
      const taskStart = task.startDate || task.created;
      const taskEnd = task.dueDate || task.resolved || task.updated;

      if (taskStart < earliestStart) {
        earliestStart = taskStart;
      }
      if (taskEnd > latestEnd) {
        latestEnd = taskEnd;
      }
    }

    const duration = Math.ceil((latestEnd - earliestStart) / (1000 * 60 * 60 * 24)); // days

    return {
      startDate: earliestStart,
      endDate: latestEnd,
      duration
    };
  }

  /**
   * Detect conflicts in the Gantt chart
   */
  private detectConflicts(tasks: GanttTask[]): GanttConflict[] {
    const conflicts: GanttConflict[] = [];

    // Check for missing dates
    const tasksWithoutDates = tasks.filter(task => !task.startDate || !task.dueDate);
    if (tasksWithoutDates.length > 0) {
      conflicts.push({
        type: 'missing_dates',
        taskIds: tasksWithoutDates.map(task => task.idReadable),
        description: `${tasksWithoutDates.length} tasks are missing start or due dates`,
        severity: 'medium'
      });
    }

    // Check for dependency cycles
    const dependencyGraph = new Map<string, string[]>();
    for (const task of tasks) {
      dependencyGraph.set(task.idReadable, task.dependencies.map(dep => dep.targetTaskIdReadable));
    }

    const cycles = this.findDependencyCycles(dependencyGraph);
    for (const cycle of cycles) {
      conflicts.push({
        type: 'dependency_cycle',
        taskIds: cycle,
        description: `Circular dependency detected: ${cycle.join(' → ')}`,
        severity: 'high'
      });
    }

    // Check for date overlaps with same assignee
    const assigneeTaskMap = new Map<string, GanttTask[]>();
    for (const task of tasks) {
      if (task.assignee && task.startDate && task.dueDate) {
        const assigneeId = task.assignee.id;
        if (!assigneeTaskMap.has(assigneeId)) {
          assigneeTaskMap.set(assigneeId, []);
        }
        assigneeTaskMap.get(assigneeId)!.push(task);
      }
    }

    for (const [assigneeId, assigneeTasks] of assigneeTaskMap) {
      for (let i = 0; i < assigneeTasks.length; i++) {
        for (let j = i + 1; j < assigneeTasks.length; j++) {
          const task1 = assigneeTasks[i];
          const task2 = assigneeTasks[j];

          if (this.datesOverlap(task1.startDate!, task1.dueDate!, task2.startDate!, task2.dueDate!)) {
            conflicts.push({
              type: 'resource_conflict',
              taskIds: [task1.idReadable, task2.idReadable],
              description: `Tasks overlap for assignee ${task1.assignee!.fullName}`,
              severity: 'medium'
            });
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Find dependency cycles using DFS
   */
  private findDependencyCycles(graph: Map<string, string[]>): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string): boolean => {
      if (recursionStack.has(node)) {
        // Found a cycle
        const cycleStart = path.indexOf(node);
        cycles.push(path.slice(cycleStart).concat([node]));
        return true;
      }

      if (visited.has(node)) {
        return false;
      }

      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (dfs(neighbor)) {
          return true;
        }
      }

      recursionStack.delete(node);
      path.pop();
      return false;
    };

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    return cycles;
  }

  /**
   * Check if two date ranges overlap
   */
  private datesOverlap(start1: number, end1: number, start2: number, end2: number): boolean {
    return start1 <= end2 && start2 <= end1;
  }

  /**
   * Update issue timeline (start date, due date, estimation)
   */
  async updateIssueTimeline(issueId: string, timelineRequest: UpdateTimelineRequest): Promise<YouTrackIssue> {
    const customFields: any[] = [];

    // Only update estimation if provided, as it's more likely to exist
    if (timelineRequest.estimation !== undefined) {
      customFields.push({
        name: 'Estimation',
        value: { minutes: timelineRequest.estimation },
        $type: 'PeriodIssueCustomField'
      });
    }

    // For date fields, use proper date field format
    if (timelineRequest.startDate !== undefined) {
      try {
        const dateField = this.buildDateCustomField('Start Date', timelineRequest.startDate);
        customFields.push(dateField);
      } catch (error) {
        if (this.config.debug) {
          console.log(`Warning: Failed to set start date: ${error}`);
        }
        // Try alternative field names
        try {
          const dateField = this.buildDateCustomField('StartDate', timelineRequest.startDate);
          customFields.push(dateField);
        } catch (altError) {
          if (this.config.debug) {
            console.log(`Warning: Failed to set StartDate: ${altError}`);
          }
        }
      }
    }

    if (timelineRequest.dueDate !== undefined) {
      try {
        const dateField = this.buildDateCustomField('Due Date', timelineRequest.dueDate);
        customFields.push(dateField);
      } catch (error) {
        if (this.config.debug) {
          console.log(`Warning: Failed to set due date: ${error}`);
        }
        // Try alternative field names
        try {
          const dateField = this.buildDateCustomField('DueDate', timelineRequest.dueDate);
          customFields.push(dateField);
        } catch (altError) {
          if (this.config.debug) {
            console.log(`Warning: Failed to set DueDate: ${altError}`);
          }
        }
      }
    }

    if (customFields.length === 0) {
      throw new Error('No timeline fields to update');
    }

    const updateData = { customFields };

    if (this.config.debug) {
      console.log(`Updating timeline for issue ${issueId}:`, JSON.stringify(updateData, null, 2));
    }

    try {
      const response = await this.makeRequest(() =>
        this.client.post(`/issues/${issueId}?fields=id,idReadable,summary,description,project(id,name,shortName),reporter(id,login,fullName),updater(id,login,fullName),assignee(id,login,fullName),created,updated,resolved,numberInProject,customFields(id,name,value(id,name,login,fullName,minutes,presentation))`, updateData)
      );
      return this.mapIssueResponse(response.data);
    } catch (error) {
      // If custom field update fails, try just updating estimation
      if (timelineRequest.estimation !== undefined) {
        return await this.setEstimation(issueId, timelineRequest.estimation);
      }
      throw error;
    }
  }

  /**
   * Calculate critical path for a set of tasks
   */
  async calculateCriticalPath(projectId: string): Promise<CriticalPathResult> {
    // Get all tasks for the project
    const ganttData = await this.getGanttData({
      projectIds: [projectId],
      includeCompleted: true // Include completed tasks for critical path analysis
    });
    const tasks = ganttData.tasks;

    if (tasks.length === 0) {
      return {
        path: [],
        duration: 0,
        tasks: []
      };
    }

    // Build dependency graph
    const taskMap = new Map<string, GanttTask>();
    const dependencyGraph = new Map<string, string[]>();
    const reverseDependencyGraph = new Map<string, string[]>();

    for (const task of tasks) {
      taskMap.set(task.idReadable, task);
      dependencyGraph.set(task.idReadable, []);
      reverseDependencyGraph.set(task.idReadable, []);
    }

    for (const task of tasks) {
      for (const dep of task.dependencies) {
        if (dep.type === 'depends_on') {
          dependencyGraph.get(task.idReadable)!.push(dep.targetTaskIdReadable);
          reverseDependencyGraph.get(dep.targetTaskIdReadable)?.push(task.idReadable);
        }
      }
    }

    // Calculate earliest start times (forward pass)
    const earliestStart = new Map<string, number>();
    const earliestFinish = new Map<string, number>();

    const calculateEarliestTimes = (taskId: string): void => {
      if (earliestStart.has(taskId)) return;

      const task = taskMap.get(taskId)!;
      const dependencies = dependencyGraph.get(taskId)!;

      let maxPredecessorFinish = task.startDate || task.created;

      for (const depId of dependencies) {
        calculateEarliestTimes(depId);
        const depFinish = earliestFinish.get(depId)!;
        maxPredecessorFinish = Math.max(maxPredecessorFinish, depFinish);
      }

      earliestStart.set(taskId, maxPredecessorFinish);

      const duration = task.dueDate && task.startDate
        ? task.dueDate - task.startDate
        : (task.estimation?.minutes || 480) * 60 * 1000; // Default 8 hours

      earliestFinish.set(taskId, maxPredecessorFinish + duration);
    };

    for (const taskId of taskMap.keys()) {
      calculateEarliestTimes(taskId);
    }

    // Find project end time
    const projectEndTime = Math.max(...Array.from(earliestFinish.values()));

    // Calculate latest start times (backward pass)
    const latestStart = new Map<string, number>();
    const latestFinish = new Map<string, number>();

    const calculateLatestTimes = (taskId: string): void => {
      if (latestFinish.has(taskId)) return;

      const task = taskMap.get(taskId)!;
      const successors = reverseDependencyGraph.get(taskId)!;

      let minSuccessorStart = projectEndTime;

      if (successors.length === 0) {
        // This is an end task
        minSuccessorStart = earliestFinish.get(taskId)!;
      } else {
        for (const succId of successors) {
          calculateLatestTimes(succId);
          const succStart = latestStart.get(succId)!;
          minSuccessorStart = Math.min(minSuccessorStart, succStart);
        }
      }

      latestFinish.set(taskId, minSuccessorStart);

      const duration = task.dueDate && task.startDate
        ? task.dueDate - task.startDate
        : (task.estimation?.minutes || 480) * 60 * 1000;

      latestStart.set(taskId, minSuccessorStart - duration);
    };

    for (const taskId of taskMap.keys()) {
      calculateLatestTimes(taskId);
    }

    // Find critical path (tasks with zero slack)
    const criticalTasks: string[] = [];
    const criticalPathTasks: Array<{
      id: string;
      idReadable: string;
      summary: string;
      startDate?: number;
      dueDate?: number;
      duration: number;
      slack: number;
    }> = [];

    for (const [taskId, task] of taskMap) {
      const slack = (latestStart.get(taskId)! - earliestStart.get(taskId)!) / (1000 * 60 * 60 * 24); // Convert to days

      if (Math.abs(slack) < 0.01) { // Critical task (accounting for floating point precision)
        criticalTasks.push(taskId);
      }

      const duration = task.dueDate && task.startDate
        ? (task.dueDate - task.startDate) / (1000 * 60 * 60 * 24)
        : (task.estimation?.minutes || 480) / (60 * 24);

      criticalPathTasks.push({
        id: task.id,
        idReadable: task.idReadable,
        summary: task.summary,
        startDate: task.startDate,
        dueDate: task.dueDate,
        duration,
        slack
      });
    }

    // Sort critical path tasks by earliest start time
    criticalTasks.sort((a, b) => earliestStart.get(a)! - earliestStart.get(b)!);

    const totalDuration = (projectEndTime - Math.min(...Array.from(earliestStart.values()))) / (1000 * 60 * 60 * 24);

    return {
      path: criticalTasks,
      duration: totalDuration,
      tasks: criticalPathTasks.sort((a, b) => a.slack - b.slack)
    };
  }
}