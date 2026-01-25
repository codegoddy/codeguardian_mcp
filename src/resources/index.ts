/**
 * Resource registration for CodeGuardian MCP
 * 
 * Resources provide access to dynamic data and dashboards.
 * Uses MCP Resources to expose large validation reports without
 * overwhelming LLM context windows.
 * 
 * @format
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  ListResourcesRequestSchema, 
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../utils/logger.js';
import { validationReportStore } from './validationReportStore.js';

/**
 * Register all resources with the MCP server
 */
export function registerResources(server: Server) {
  // =========================================================================
  // List Resource Templates (for dynamic URIs)
  // =========================================================================
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
    return {
      resourceTemplates: [
        {
          uriTemplate: 'codeguardian://validation-report/{jobId}',
          name: 'Validation Report Summary',
          description: 'Summary of a validation job result. Use query params for chunks: ?type=hallucinations&chunk=0',
          mimeType: 'application/json',
        },
        {
          uriTemplate: 'codeguardian://validation-report/{jobId}/hallucinations/{chunk}',
          name: 'Hallucination Details',
          description: 'Paginated hallucination issues from a validation report',
          mimeType: 'application/json',
        },
        {
          uriTemplate: 'codeguardian://validation-report/{jobId}/dead-code/{chunk}',
          name: 'Dead Code Details',
          description: 'Paginated dead code issues from a validation report',
          mimeType: 'application/json',
        },
        {
          uriTemplate: 'codeguardian://validation-report/{jobId}/by-severity/{severity}',
          name: 'Issues by Severity',
          description: 'Issues filtered by severity (critical, high, medium, low, warning)',
          mimeType: 'application/json',
        },
        {
          uriTemplate: 'codeguardian://validation-report/{jobId}/by-type/{type}',
          name: 'Issues by Type',
          description: 'Issues filtered by type (e.g. dependencyHallucination)',
          mimeType: 'application/json',
        },
        {
          uriTemplate: 'codeguardian://validation-report/{jobId}/by-file/{filePath}',
          name: 'Issues by File',
          description: 'Issues filtered by file path',
          mimeType: 'application/json',
        },
      ],
    };
  });

  // =========================================================================
  // List Available Resources
  // =========================================================================
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    // Get dynamic validation reports
    const validationReports = validationReportStore.list().map(report => ({
      uri: report.uri,
      name: `Validation Report: ${report.jobId}`,
      description: `${report.totalIssues} issues found - Created ${report.createdAt}`,
      mimeType: 'application/json',
    }));

    return {
      resources: [
        // Static resources
        {
          uri: 'codeguardian://quality-dashboard',
          name: 'Quality Dashboard',
          description: 'Real-time code quality metrics and trends',
          mimeType: 'application/json',
        },
        {
          uri: 'codeguardian://vulnerability-db',
          name: 'Vulnerability Database',
          description: 'Common AI-generated security vulnerabilities',
          mimeType: 'application/json',
        },
        {
          uri: 'codeguardian://best-practices',
          name: 'Best Practices Library',
          description: 'Context-aware coding best practices',
          mimeType: 'application/json',
        },
        // Dynamic validation reports
        ...validationReports,
      ],
    };
  });

  // =========================================================================
  // Read Resource Content
  // =========================================================================
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    logger.info(`Reading resource: ${uri}`);

    try {
      // Parse validation report URIs
      // Pattern: codeguardian://validation-report/{jobId}[/hallucinations|dead-code/{chunk}]
      const validationMatch = uri.match(/^codeguardian:\/\/validation-report\/([^/]+)(\/(.+))?$/);
      
      if (validationMatch) {
        const jobId = validationMatch[1];
        const subPath = validationMatch[3];

        if (!validationReportStore.has(jobId)) {
          throw new Error(`Validation report not found: ${jobId}`);
        }

        // Return summary if no subpath
        if (!subPath) {
          const summary = validationReportStore.getSummary(jobId);
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  ...summary,
                  _help: {
                    message: 'This is a summary. Use the URIs below to fetch detailed issue chunks.',
                    hallucinations: `${uri}/hallucinations/0`,
                    deadCode: `${uri}/dead-code/0`,
                    filter: `Use get_validation_results with filters for specific queries`,
                  },
                }, null, 2),
              },
            ],
          };
        }

        // Parse chunk requests: hallucinations/{chunk} or dead-code/{chunk}
        const hallucinationChunkMatch = subPath.match(/^hallucinations\/(\d+)$/);
        if (hallucinationChunkMatch) {
          const chunkIndex = parseInt(hallucinationChunkMatch[1], 10);
          const chunk = validationReportStore.getHallucinationsChunk(jobId, chunkIndex);
          
          if (!chunk) {
            throw new Error(`Invalid chunk index: ${chunkIndex}`);
          }

          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  jobId,
                  ...chunk,
                  nextChunk: chunk.chunkIndex < chunk.totalChunks - 1 
                    ? `codeguardian://validation-report/${jobId}/hallucinations/${chunk.chunkIndex + 1}`
                    : null,
                  prevChunk: chunk.chunkIndex > 0
                    ? `codeguardian://validation-report/${jobId}/hallucinations/${chunk.chunkIndex - 1}`
                    : null,
                }, null, 2),
              },
            ],
          };
        }

        const deadCodeChunkMatch = subPath.match(/^dead-code\/(\d+)$/);
        if (deadCodeChunkMatch) {
          const chunkIndex = parseInt(deadCodeChunkMatch[1], 10);
          const chunk = validationReportStore.getDeadCodeChunk(jobId, chunkIndex);
          
          if (!chunk) {
            throw new Error(`Invalid chunk index: ${chunkIndex}`);
          }

          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  jobId,
                  ...chunk,
                  nextChunk: chunk.chunkIndex < chunk.totalChunks - 1 
                    ? `codeguardian://validation-report/${jobId}/dead-code/${chunk.chunkIndex + 1}`
                    : null,
                  prevChunk: chunk.chunkIndex > 0
                    ? `codeguardian://validation-report/${jobId}/dead-code/${chunk.chunkIndex - 1}`
                    : null,
                }, null, 2),
              },
            ],
          };
        }

        // Parse categorized requests
        const severityMatch = subPath.match(/^by-severity\/([^/]+)$/);
        if (severityMatch) {
          const severity = severityMatch[1];
          const categorized = validationReportStore.getBySeverity(jobId);
          
          if (!categorized || !categorized[severity]) {
            throw new Error(`Invalid severity category: ${severity}`);
          }

          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                jobId,
                category: 'severity',
                filter: severity,
                count: categorized[severity].length,
                issues: categorized[severity],
              }, null, 2),
            }],
          };
        }

        const typeMatch = subPath.match(/^by-type\/([^/]+)$/);
        if (typeMatch) {
          const type = typeMatch[1];
          const categorized = validationReportStore.getByType(jobId);
          
          if (!categorized || !categorized[type]) {
            throw new Error(`Invalid issue type: ${type}`);
          }

          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                jobId,
                category: 'type',
                filter: type,
                count: categorized[type].length,
                issues: categorized[type],
              }, null, 2),
            }],
          };
        }

        const fileMatch = subPath.match(/^by-file\/(.+)$/);
        if (fileMatch) {
          // Decode generic URI component just in case, though usually handled by MCP
          const filePath = decodeURIComponent(fileMatch[1]);
          const categorized = validationReportStore.getByFile(jobId);
          
          // Try exact match or partial match
          let issues = categorized ? categorized[filePath] : undefined;
          
          if (!issues && categorized) {
             // Fallback: try finding by partial string if exact match fails
             const key = Object.keys(categorized).find(k => k.includes(filePath));
             if (key) issues = categorized[key];
          }

          if (!issues) {
             return {
                contents: [{
                  uri,
                  mimeType: 'application/json',
                  text: JSON.stringify({
                    jobId,
                    category: 'file',
                    filter: filePath,
                    count: 0,
                    issues: [],
                    message: "No issues found for this file path."
                  }, null, 2),
                }],
             };
          }

          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                jobId,
                category: 'file',
                filter: filePath,
                count: issues.length,
                issues: issues,
              }, null, 2),
            }],
          };
        }

        throw new Error(`Unknown validation report path: ${subPath}`);
      }

      // Static resources
      switch (uri) {
        case 'codeguardian://quality-dashboard':
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  message: 'Quality dashboard - coming soon',
                  metrics: {},
                }, null, 2),
              },
            ],
          };

        case 'codeguardian://vulnerability-db':
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  message: 'Vulnerability database - coming soon',
                  vulnerabilities: [],
                }, null, 2),
              },
            ],
          };

        case 'codeguardian://best-practices':
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  message: 'Best practices library - coming soon',
                  practices: [],
                }, null, 2),
              },
            ],
          };

        default:
          throw new Error(`Unknown resource: ${uri}`);
      }
    } catch (error) {
      logger.error(`Error reading resource ${uri}:`, error);
      throw error;
    }
  });
}
