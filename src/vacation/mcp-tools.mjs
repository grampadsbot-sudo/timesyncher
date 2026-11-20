import { ITEM_LOCATION_SCHEMA, VACATION_IMPORT_FORMAT_SCHEMA } from './mcp-schema.mjs';

export const MCP_TOOLS = [
  {
    name: 'describe_import_format',
    description: 'Returns the Vacay Keepsake vacation JSON schema (vacation, days, flights, hotels, cars, restaurants, activities, notes, media links) plus one complete filled example that validates against the schema.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        vacation_id: { type: 'string', description: 'Optional scoped vacation id to verify access.' },
      },
    },
  },
  {
    name: 'start_import',
    description: 'Creates or updates a draft vacation in staging tables (including optional unscheduled long-list items) and returns draft_id. Nothing is published or visible in the live vacation list until approved in the app.',
    inputSchema: {
      type: 'object',
      required: ['vacation'],
      additionalProperties: false,
      properties: {
        draft_id: { type: 'string', description: 'Optional existing draft id to update in place before commit.' },
        vacation_id: { type: 'string', description: 'Optional scoped vacation id (must match the access token scope).' },
        apply_mode: { type: 'string', enum: ['create_new', 'populate_scoped'], description: 'Whether approving creates a new vacation or populates the scoped vacation.' },
        ...VACATION_IMPORT_FORMAT_SCHEMA.properties,
      },
    },
  },
  {
    name: 'upload_media',
    description: 'Issues one signed expiring upload URL per photo or video so raw media bytes never pass through the AI or MCP request body. Call with action="finalize" after uploading to attach media by EXIF capture time and vacation timezone or place it in the unassigned bucket.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ['request_upload', 'finalize'], description: 'Request signed upload URLs or finalize completed uploads.' },
        vacation_id: { type: 'string', description: 'Optional scoped vacation id (must match the access token scope).' },
        draft_id: { type: 'string', description: 'Optional draft or change set id to attach uploaded media to.' },
        timezone: { type: 'string', description: 'Optional IANA timezone fallback when finalizing media.' },
        files: {
          type: 'array',
          description: 'Photo or video metadata entries (filename and mime_type only; never pass raw bytes).',
          items: {
            type: 'object',
            required: ['filename', 'mime_type'],
            additionalProperties: false,
            properties: {
              filename: { type: 'string', minLength: 1, description: 'Original file name.' },
              mime_type: { type: 'string', minLength: 1, description: 'Image or video MIME type such as image/jpeg or video/mp4.' },
              size_bytes: { type: 'integer', minimum: 1, description: 'Expected file size in bytes.' },
              media_kind: { type: 'string', enum: ['photo', 'video'], description: 'Photo or video.' },
              caption: { type: 'string', description: 'Optional caption.' },
              thing_ref: { type: 'string', description: 'Optional place or item ref id to link this media to.' },
            },
          },
        },
        media_ids: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          description: 'Media ids to finalize after direct upload to the signed URLs.',
        },
        media_id: { type: 'string', description: 'Single media id to finalize.' },
      },
    },
  },
  {
    name: 'preview_import',
    description: 'Returns the exact landing preview of a staged draft vacation or edit change set: each day and scheduled item, unscheduled long-list items, every photo/video with item/day attachment and EXIF time/GPS match, file sizes, total bytes, missing details, conflicts, and preview_hash.',
    inputSchema: {
      type: 'object',
      required: ['draft_id'],
      additionalProperties: false,
      properties: {
        draft_id: { type: 'string', minLength: 1, description: 'Draft or change set id returned by start_import or update_vacation.' },
        vacation_id: { type: 'string', description: 'Optional scoped vacation id (must match the access token scope).' },
      },
    },
  },
  {
    name: 'commit_import',
    description: 'Stages a draft vacation as pending approval in the Vacay Keepsake app. Requires preview_hash from preview_import and refuses if the draft changed since preview. Does not publish or alter live vacations until an owner or collaborator approves in the app.',
    inputSchema: {
      type: 'object',
      required: ['draft_id', 'preview_hash'],
      additionalProperties: false,
      properties: {
        draft_id: { type: 'string', minLength: 1, description: 'Draft id returned by start_import.' },
        preview_hash: { type: 'string', minLength: 1, description: 'Exact preview_hash returned by preview_import for the current draft state.' },
        vacation_id: { type: 'string', description: 'Optional scoped vacation id (must match the access token scope).' },
        note: { type: 'string', description: 'Optional note for the owner or collaborator reviewing this import.' },
      },
    },
  },
  {
    name: 'read_vacation',
    description: 'Reads the current live itinerary and long-list items of the vacation your AI access token is scoped to, returning stable item ids for targeted edits.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        vacation_id: { type: 'string', description: 'Optional scoped vacation id (must match the access token scope).' },
      },
    },
  },
  {
    name: 'update_vacation',
    description: 'Stages targeted edits to specific items by id (add scheduled or unscheduled long-list items, change or remove items, update day fields, or attach uploaded media). Pass dry_run=true to preview the exact landing payload and preview_hash without staging. Never wholesale overwrites the vacation. Requires in-app approval before going live.',
    inputSchema: {
      type: 'object',
      required: ['operations'],
      additionalProperties: false,
      properties: {
        vacation_id: { type: 'string', description: 'Optional scoped vacation id (must match the access token scope).' },
        summary: { type: 'string', description: 'Short explanation of the proposed edits.' },
        dry_run: { type: 'boolean', description: 'When true, returns the exact landing preview and preview_hash without staging a change set.' },
        preview_hash: { type: 'string', description: 'Optional preview_hash from a dry_run call; refuses to stage if the resulting preview changed.' },
        operations: {
          type: 'array',
          minItems: 1,
          description: 'Targeted edit operations applied by item id or day date.',
          items: {
            type: 'object',
            required: ['op'],
            additionalProperties: false,
            properties: {
              op: {
                type: 'string',
                enum: ['add_item', 'update_item', 'remove_item', 'update_day', 'attach_media', 'update_vacation_fields'],
              },
              item_id: { type: 'string', description: 'Existing item id for update_item or remove_item.' },
              day_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Vacation day date (YYYY-MM-DD) for update_day or attach_media.' },
              media_id: { type: 'string', description: 'Uploaded media id for attach_media.' },
              thing_id: { type: 'string', description: 'Optional existing item id for attach_media.' },
              thing_ref: { type: 'string', description: 'Optional new item ref from add_item in the same batch for attach_media.' },
              caption: { type: 'string', description: 'Optional caption for attach_media.' },
              item: {
                type: 'object',
                description: 'New item fields for add_item. Omit day_date and starts_at or set unscheduled=true to save as an unscheduled long-list item.',
                properties: {
                  ref: { type: 'string' },
                  category: {
                    type: 'string',
                    enum: ['flight', 'hotel', 'car', 'restaurant', 'activity', 'attraction', 'store', 'bar', 'tour', 'event', 'sightseeing', 'note'],
                  },
                  title: { type: 'string', minLength: 1 },
                  description: { type: 'string' },
                  day_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
                  starts_at: { type: 'string' },
                  ends_at: { type: 'string' },
                  unscheduled: { type: 'boolean' },
                  total_price_cents: { type: 'integer', minimum: 0 },
                  currency: { type: 'string' },
                  location: ITEM_LOCATION_SCHEMA,
                  website: { type: 'string' },
                  notes: { type: 'string' },
                },
              },
              patch: {
                type: 'object',
                description: 'Targeted field changes for update_item, update_day, or update_vacation_fields.',
              },
            },
          },
        },
      },
    },
  },
];
