import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import DatabaseDataPreview from '@/components/DatabaseDataPreview.vue';

describe('DatabaseDataPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockPreviewData = {
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
      },
      {
        name: 'guilds',
        rowCount: 25,
        columns: ['id', 'name', 'owner_id', 'created_at'],
        sampleRows: [
          { id: 1, name: 'Gaming Guild', owner_id: 1, created_at: '2024-01-10T09:00:00Z' },
          { id: 2, name: 'Study Group', owner_id: 2, created_at: '2024-01-12T14:30:00Z' },
        ],
      },
    ],
    totalRecords: 175,
    fileSize: '2.5 MB',
    format: 'SQLite',
  };

  it('should render preview container when data is provided', () => {
    const wrapper = mount(DatabaseDataPreview, {
      props: {
        previewData: mockPreviewData,
        visible: true,
      },
    });
    
    const container = wrapper.find('[data-testid="data-preview-container"]');
    expect(container.exists()).toBe(true);
  });

  it('should not render when not visible', () => {
    const wrapper = mount(DatabaseDataPreview, {
      props: {
        previewData: mockPreviewData,
        visible: false,
      },
    });
    
    const container = wrapper.find('[data-testid="data-preview-container"]');
    expect(container.exists()).toBe(false);
  });

  it('should display file summary information', () => {
    const wrapper = mount(DatabaseDataPreview, {
      props: {
        previewData: mockPreviewData,
        visible: true,
      },
    });
    
    const summary = wrapper.find('[data-testid="file-summary"]');
    expect(summary.exists()).toBe(true);
    expect(summary.text()).toContain('2.5 MB');
    expect(summary.text()).toContain('SQLite');
    expect(summary.text()).toContain('175');
    expect(summary.text()).toContain('2');
  });

  it('should render table tabs for navigation', () => {
    const wrapper = mount(DatabaseDataPreview, {
      props: {
        previewData: mockPreviewData,
        visible: true,
      },
    });
    
    const tableTabs = wrapper.find('[data-testid="table-tabs"]');
    expect(tableTabs.exists()).toBe(true);
    
    const tabs = tableTabs.findAll('[data-testid^="table-tab-"]');
    expect(tabs).toHaveLength(2);
    expect(tabs[0].text()).toContain('users');
    expect(tabs[0].text()).toContain('150 rows');
    expect(tabs[1].text()).toContain('guilds');
    expect(tabs[1].text()).toContain('25 rows');
  });

  it('should show active table content by default', () => {
    const wrapper = mount(DatabaseDataPreview, {
      props: {
        previewData: mockPreviewData,
        visible: true,
      },
    });
    
    const tableContent = wrapper.find('[data-testid="table-content"]');
    expect(tableContent.exists()).toBe(true);
    
    const tableName = wrapper.find('[data-testid="active-table-name"]');
    expect(tableName.text()).toBe('users');
  });

  it('should display table headers correctly', () => {
    const wrapper = mount(DatabaseDataPreview, {
      props: {
        previewData: mockPreviewData,
        visible: true,
      },
    });
    
    const headers = wrapper.findAll('[data-testid^="column-header-"]');
    expect(headers).toHaveLength(4);
    expect(headers[0].text()).toBe('id');
    expect(headers[1].text()).toBe('username');
    expect(headers[2].text()).toBe('email');
    expect(headers[3].text()).toBe('created_at');
  });

  it('should display sample rows with correct data', () => {
    const wrapper = mount(DatabaseDataPreview, {
      props: {
        previewData: mockPreviewData,
        visible: true,
      },
    });
    
    const rows = wrapper.findAll('[data-testid^="data-row-"]');
    expect(rows).toHaveLength(3);
    
    // Check first row data
    const firstRowCells = rows[0].findAll('td');
    expect(firstRowCells[0].text()).toBe('1');
    expect(firstRowCells[1].text()).toBe('john_doe');
    expect(firstRowCells[2].text()).toBe('john@example.com');
    expect(firstRowCells[3].text()).toBe('2024-01-15T10:30:00Z');
  });

  it('should switch table content when tab is clicked', async () => {
    const wrapper = mount(DatabaseDataPreview, {
      props: {
        previewData: mockPreviewData,
        visible: true,
      },
    });
    
    // Click on guilds tab
    const guildsTab = wrapper.find('[data-testid="table-tab-guilds"]');
    await guildsTab.trigger('click');
    
    // Should show guilds table content
    const tableName = wrapper.find('[data-testid="active-table-name"]');
    expect(tableName.text()).toBe('guilds');
    
    // Should show guilds columns
    const headers = wrapper.findAll('[data-testid^="column-header-"]');
    expect(headers).toHaveLength(4);
    expect(headers[0].text()).toBe('id');
    expect(headers[1].text()).toBe('name');
    expect(headers[2].text()).toBe('owner_id');
    expect(headers[3].text()).toBe('created_at');
  });

  it('should highlight active tab', async () => {
    const wrapper = mount(DatabaseDataPreview, {
      props: {
        previewData: mockPreviewData,
        visible: true,
      },
    });
    
    // Users tab should be active by default
    const usersTab = wrapper.find('[data-testid="table-tab-users"]');
    expect(usersTab.classes()).toContain('active');
    
    // Click guilds tab
    const guildsTab = wrapper.find('[data-testid="table-tab-guilds"]');
    await guildsTab.trigger('click');
    
    // Guilds tab should now be active
    expect(guildsTab.classes()).toContain('active');
    expect(usersTab.classes()).not.toContain('active');
  });

  it('should show validation warnings when provided', () => {
    const dataWithWarnings = {
      ...mockPreviewData,
      validationWarnings: [
        { table: 'users', column: 'email', message: 'Duplicate email addresses found', count: 3 },
        { table: 'guilds', column: 'name', message: 'Empty guild names detected', count: 1 },
      ],
    };
    
    const wrapper = mount(DatabaseDataPreview, {
      props: {
        previewData: dataWithWarnings,
        visible: true,
      },
    });
    
    const warnings = wrapper.find('[data-testid="validation-warnings"]');
    expect(warnings.exists()).toBe(true);
    
    const warningItems = warnings.findAll('[data-testid^="warning-item-"]');
    expect(warningItems).toHaveLength(2);
    expect(warningItems[0].text()).toContain('users.email');
    expect(warningItems[0].text()).toContain('Duplicate email addresses');
    expect(warningItems[0].text()).toContain('3');
  });

  it('should show data type information for columns', () => {
    const dataWithTypes = {
      ...mockPreviewData,
      tables: [
        {
          ...mockPreviewData.tables[0],
          columnTypes: {
            id: 'INTEGER',
            username: 'TEXT',
            email: 'TEXT',
            created_at: 'DATETIME',
          },
        },
      ],
    };
    
    const wrapper = mount(DatabaseDataPreview, {
      props: {
        previewData: dataWithTypes,
        visible: true,
      },
    });
    
    const headers = wrapper.findAll('[data-testid^="column-header-"]');
    expect(headers[0].text()).toContain('INTEGER');
    expect(headers[1].text()).toContain('TEXT');
    expect(headers[2].text()).toContain('TEXT');
    expect(headers[3].text()).toContain('DATETIME');
  });

  it('should display row count and pagination info', () => {
    const wrapper = mount(DatabaseDataPreview, {
      props: {
        previewData: mockPreviewData,
        visible: true,
      },
    });
    
    const paginationInfo = wrapper.find('[data-testid="pagination-info"]');
    expect(paginationInfo.exists()).toBe(true);
    expect(paginationInfo.text()).toContain('Showing 3 of 150 rows');
  });

  it('should handle empty tables gracefully', () => {
    const emptyData = {
      tables: [
        {
          name: 'empty_table',
          rowCount: 0,
          columns: ['id', 'name'],
          sampleRows: [],
        },
      ],
      totalRecords: 0,
      fileSize: '1 KB',
      format: 'SQLite',
    };
    
    const wrapper = mount(DatabaseDataPreview, {
      props: {
        previewData: emptyData,
        visible: true,
      },
    });
    
    const emptyMessage = wrapper.find('[data-testid="empty-table-message"]');
    expect(emptyMessage.exists()).toBe(true);
    expect(emptyMessage.text()).toContain('No data to preview');
  });

  it('should show loading state when loading', () => {
    const wrapper = mount(DatabaseDataPreview, {
      props: {
        previewData: null,
        visible: true,
        loading: true,
      },
    });
    
    const loadingSpinner = wrapper.find('[data-testid="preview-loading"]');
    expect(loadingSpinner.exists()).toBe(true);
    expect(loadingSpinner.text()).toContain('Analyzing file');
  });

  it('should display error message when preview fails', () => {
    const wrapper = mount(DatabaseDataPreview, {
      props: {
        previewData: null,
        visible: true,
        error: 'Failed to parse file: Invalid SQLite format',
      },
    });
    
    const errorMessage = wrapper.find('[data-testid="preview-error"]');
    expect(errorMessage.exists()).toBe(true);
    expect(errorMessage.text()).toContain('Failed to parse file');
  });

  it('should emit close event when close button is clicked', async () => {
    const wrapper = mount(DatabaseDataPreview, {
      props: {
        previewData: mockPreviewData,
        visible: true,
      },
    });
    
    const closeButton = wrapper.find('[data-testid="close-preview-button"]');
    await closeButton.trigger('click');
    
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('should truncate long cell values with ellipsis', () => {
    const dataWithLongValues = {
      ...mockPreviewData,
      tables: [
        {
          name: 'test_table',
          rowCount: 1,
          columns: ['id', 'long_text'],
          sampleRows: [
            { 
              id: 1, 
              long_text: 'This is a very long text value that should be truncated in the preview table to maintain readability and proper layout of the data preview component',
            },
          ],
        },
      ],
    };
    
    const wrapper = mount(DatabaseDataPreview, {
      props: {
        previewData: dataWithLongValues,
        visible: true,
      },
    });
    
    const longTextCell = wrapper.find('[data-testid="cell-long_text-0"]');
    expect(longTextCell.exists()).toBe(true);
    expect(longTextCell.text().length).toBeLessThan(100); // Should be truncated
    expect(longTextCell.text()).toContain('...');
  });

  it('should show full cell value in tooltip on hover', async () => {
    const dataWithLongValues = {
      ...mockPreviewData,
      tables: [
        {
          name: 'test_table',
          rowCount: 1,
          columns: ['id', 'description'],
          sampleRows: [
            { 
              id: 1, 
              description: 'This is a long description that should show full text in tooltip',
            },
          ],
        },
      ],
    };
    
    const wrapper = mount(DatabaseDataPreview, {
      props: {
        previewData: dataWithLongValues,
        visible: true,
      },
    });
    
    const descriptionCell = wrapper.find('[data-testid="cell-description-0"]');
    expect(descriptionCell.attributes('title')).toBe('This is a long description that should show full text in tooltip');
  });

  it('should handle null and undefined values correctly', () => {
    const dataWithNulls = {
      ...mockPreviewData,
      tables: [
        {
          name: 'test_table',
          rowCount: 2,
          columns: ['id', 'nullable_field', 'undefined_field'],
          sampleRows: [
            { id: 1, nullable_field: null, undefined_field: undefined },
            { id: 2, nullable_field: 'value', undefined_field: 'another_value' },
          ],
        },
      ],
    };
    
    const wrapper = mount(DatabaseDataPreview, {
      props: {
        previewData: dataWithNulls,
        visible: true,
      },
    });
    
    const nullCell = wrapper.find('[data-testid="cell-nullable_field-0"]');
    expect(nullCell.text()).toBe('NULL');
    expect(nullCell.classes()).toContain('null-value');
    
    const undefinedCell = wrapper.find('[data-testid="cell-undefined_field-0"]');
    expect(undefinedCell.text()).toBe('NULL');
    expect(undefinedCell.classes()).toContain('null-value');
  });
});