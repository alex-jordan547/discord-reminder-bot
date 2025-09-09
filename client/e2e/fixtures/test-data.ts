// Test data fixtures for Playwright tests

export const testFiles = {
  validSqlite: {
    name: 'test-database.db',
    mimeType: 'application/x-sqlite3',
    content: 'SQLite format\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00',
  },
  validJson: {
    name: 'test-data.json',
    mimeType: 'application/json',
    content: JSON.stringify({
      users: [
        { id: 1, name: 'John Doe', email: 'john@example.com' },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
      ],
      guilds: [
        { id: 1, name: 'Test Guild', owner_id: 1 },
      ],
    }),
  },
  validCsv: {
    name: 'test-data.csv',
    mimeType: 'text/csv',
    content: 'id,name,email\n1,John Doe,john@example.com\n2,Jane Smith,jane@example.com',
  },
  invalidFile: {
    name: 'invalid-file.txt',
    mimeType: 'text/plain',
    content: 'This is not a valid database file',
  },
  largeFile: {
    name: 'large-database.db',
    mimeType: 'application/x-sqlite3',
    content: 'x'.repeat(1024 * 1024), // 1MB file
  },
};

export const mockPreviewData = {
  tables: [
    {
      name: 'users',
      rowCount: 150,
      columns: ['id', 'username', 'email', 'created_at'],
      sampleRows: [
        { id: 1, username: 'john_doe', email: 'john@example.com', created_at: '2024-01-15T10:30:00Z' },
        { id: 2, username: 'jane_smith', email: 'jane@example.com', created_at: '2024-01-15T11:45:00Z' },
        { id: 3, username: 'bob_wilson', email: 'bob@example.com', created_at: '2024-01-15T12:15:00Z' },
      ],
      columnTypes: {
        id: 'INTEGER',
        username: 'TEXT',
        email: 'TEXT',
        created_at: 'DATETIME',
      },
    },
    {
      name: 'guilds',
      rowCount: 25,
      columns: ['id', 'name', 'owner_id', 'created_at'],
      sampleRows: [
        { id: 1, name: 'Gaming Guild', owner_id: 1, created_at: '2024-01-10T09:00:00Z' },
        { id: 2, name: 'Study Group', owner_id: 2, created_at: '2024-01-12T14:30:00Z' },
      ],
      columnTypes: {
        id: 'INTEGER',
        name: 'TEXT',
        owner_id: 'INTEGER',
        created_at: 'DATETIME',
      },
    },
  ],
  totalRecords: 175,
  fileSize: '2.5 MB',
  format: 'SQLite Database',
  validationWarnings: [
    { table: 'users', column: 'email', message: 'Duplicate email addresses found', count: 2 },
  ],
};

export const exportFormats = ['sqlite', 'json', 'csv'] as const;

export const confirmationTexts = {
  import: 'IMPORT',
  delete: 'DELETE',
  clear: 'CLEAR',
} as const;