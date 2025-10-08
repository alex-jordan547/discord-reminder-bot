# Contributing to Discord Reminder Bot

Thank you for your interest in contributing to Discord Reminder Bot! This document provides guidelines and information for contributors.

## 🚀 Getting Started

### Prerequisites

- **Python 3.12+** (Python 3.13 requires `audioop-lts`)
- **Discord Application** with bot permissions
- **Git** for version control
- **Virtual Environment** (recommended)

### Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/your-username/discord-reminder-bot.git
   cd discord-reminder-bot
   ```

2. **Set Up Environment**
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   pip install audioop-lts  # Python 3.13 compatibility
   ```

3. **Configure Development Environment**
   ```bash
   cp server/.env.example server/.env
   # Edit server/.env with your Discord token and test settings
   ```

4. **Run Development Instance**
   ```bash
   ./run_dev.sh
   # Or: python bot.py
   ```

## 🏗️ Project Structure

Understanding the codebase architecture:

```
discord-reminder-bot/
├── bot.py                     # Main entry point
├── commands/                  # Command handlers
│   ├── handlers.py           # Core business logic
│   ├── slash_commands.py     # Discord slash commands
│   └── command_utils.py      # Command utilities
├── config/                   # Configuration
│   └── settings.py          # Centralized settings
├── models/                   # Database models (Pewee ORM)
│   ├── database_models.py   # SQLite models (Guild, Event, User, etc.)
│   ├── schema_manager.py    # Database schema management
│   ├── migrations.py        # Database migrations
│   └── validation.py        # Data validation
├── persistence/              # Data persistence
│   ├── database.py          # SQLite connection management
│   └── storage.py           # Legacy JSON storage (fallback)
├── utils/                    # Utility modules
│   ├── logging_config.py    # Logging configuration
│   ├── message_parser.py    # Discord message parsing
│   ├── permissions.py       # Permission handling
│   ├── error_recovery.py    # Error handling & retries
│   └── validation.py        # Input validation
├── tests/                    # Test suite
│   ├── unit/                # Unit tests
│   ├── integration/         # Integration tests
│   └── fixtures/            # Test data
└── scripts/                  # Development utilities
    └── dev/                 # Development tools
```

## 🧪 Development Guidelines

### Code Style

- **PEP 8**: Follow Python style guidelines
- **Type Hints**: Use type annotations for function signatures
- **Docstrings**: Document classes and functions
- **Comments**: Explain complex logic, not obvious code

### Testing

Run tests before submitting changes:

```bash
# All tests
python -m pytest tests/ -v

# Unit tests only
python -m pytest tests/unit/ -v

# Integration tests only
python -m pytest tests/integration/ -v

# Database-specific tests
python -m pytest tests/unit/test_database_models.py -v
python -m pytest tests/unit/test_migration.py -v

# Specific test file
python tests/unit/test_dynamic_scheduling.py
```

### Database Development

When working with database models:

```bash
# Initialize database for development
python -c "from models.schema_manager import setup_database; setup_database()"

# Check database status
python -c "from models.schema_manager import get_database_status; print(get_database_status())"

# Reset database (CAUTION: deletes all data)
python -c "from models.schema_manager import reset_database; reset_database()"

# Run migration tests
python -m pytest tests/unit/test_migration.py -v
```

### Code Quality

Use development scripts to maintain code quality:

```bash
# Fix formatting issues
python scripts/dev/fix_formatting.py

# Validate imports
python scripts/dev/validate_imports.py

# Check code formatting
python tests/unit/test_formatting.py
```

### Test Mode Configuration

For development and testing:

```env
TEST_MODE=true
REMINDER_INTERVAL_HOURS=0.0167  # 1 minute for quick testing
LOG_LEVEL=DEBUG
LOG_TO_FILE=true
```

## 🔧 Development Workflow

### 1. Feature Development

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Implement Changes**
   - Write code following project conventions
   - Add tests for new functionality
   - Update documentation if needed

3. **Test Locally**
   ```bash
   # Run tests
   python -m pytest tests/

   # Test formatting
   python scripts/dev/fix_formatting.py

   # Validate imports
   python scripts/dev/validate_imports.py
   ```

4. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat: add new feature description"
   ```

### 2. Bug Fixes

1. **Create Bug Fix Branch**
   ```bash
   git checkout -b fix/bug-description
   ```

2. **Reproduce Issue**
   - Write a test that reproduces the bug
   - Confirm the test fails

3. **Fix and Test**
   - Implement the fix
   - Ensure the test now passes
   - Run full test suite

4. **Commit Fix**
   ```bash
   git commit -m "fix: resolve issue with specific component"
   ```

### 3. Testing New Features

Test your changes thoroughly:

- **Unit Tests**: Test individual functions and classes
- **Integration Tests**: Test component interactions
- **Manual Testing**: Test in real Discord environment
- **Error Scenarios**: Test error handling and edge cases

## 📋 Contribution Types

### 🐛 Bug Reports

When reporting bugs:
- Use the issue template
- Provide clear reproduction steps
- Include error messages and logs
- Specify environment (Python version, OS)

### ✨ Feature Requests

When requesting features:
- Explain the use case and benefit
- Provide examples of expected behavior
- Consider backward compatibility
- Discuss implementation approach

### 🔧 Code Contributions

**High-Priority Areas:**
- Database model improvements and optimizations
- Migration system enhancements
- Test coverage improvements for SQLite functionality
- Performance optimizations for database queries
- Error handling enhancements
- Documentation updates
- New administrative slash commands

**Medium-Priority Areas:**
- Database schema evolution and migrations
- Advanced database features (full-text search, analytics)
- Code refactoring for better database integration
- Additional utility functions for database management
- Docker improvements
- CI/CD enhancements

## 🏷️ Commit Message Guidelines

Use conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(commands): add pause/resume functionality for reminders
fix(scheduling): resolve precision issues in dynamic scheduling
docs(readme): update slash commands documentation
test(unit): add tests for error recovery system
```

## 🧪 Testing Guidelines

### Unit Tests

- Test individual functions and methods
- Mock external dependencies (Discord API)
- Test edge cases and error conditions
- Maintain high code coverage

### Integration Tests

- Test component interactions
- Test Discord command workflows
- Test error recovery scenarios
- Test multi-server functionality

### Test Organization

```
tests/
├── unit/
│   ├── test_dynamic_scheduling.py    # Scheduling logic tests
│   ├── test_sleep_mode.py           # Sleep mode tests
│   ├── test_formatting.py          # Code formatting tests
│   └── test_validation_basic.py    # Basic validation tests
├── integration/
│   ├── test_health_commands.py     # Health command integration
│   ├── test_concurrency.py         # Concurrency tests
│   └── test_error_recovery.py      # Error recovery tests
└── fixtures/
    └── test_compatibility.json      # Test data
```

## 📚 Documentation Standards

### Code Documentation

- **Classes**: Document purpose, attributes, and usage
- **Functions**: Document parameters, return values, and exceptions
- **Modules**: Include module-level docstring explaining purpose

### External Documentation

- **README.md**: Keep feature list and examples current
- **docs/CLAUDE.md**: Maintain architecture and development details
- **API Changes**: Document breaking changes and migrations

## 🔍 Code Review Process

### Pull Request Guidelines

1. **Clear Description**
   - Explain what changes were made and why
   - Reference related issues
   - Highlight breaking changes

2. **Testing Evidence**
   - Include test results
   - Provide screenshots for UI changes
   - Document manual testing performed

3. **Documentation Updates**
   - Update relevant documentation
   - Add code comments for complex logic
   - Update changelog if needed

### Review Criteria

- **Functionality**: Does it work as intended?
- **Testing**: Are there adequate tests?
- **Code Quality**: Is it readable and maintainable?
- **Performance**: Does it impact bot performance?
- **Backward Compatibility**: Does it break existing functionality?

## 🚨 Security Considerations

- **Never commit secrets** (tokens, keys, passwords)
- **Validate user input** thoroughly
- **Use parameterized queries** for any database operations
- **Implement rate limiting** for user-facing commands
- **Handle Discord API errors** gracefully

## 📞 Getting Help

- **Discord Issues**: Check existing issues first
- **Documentation**: Read docs/CLAUDE.md for architecture details
- **Code Questions**: Comment on related issues or PRs
- **General Questions**: Create a discussion thread

## 🎯 Development Priorities

### High Priority
- Bug fixes and stability improvements
- Test coverage expansion
- Performance optimizations
- Security enhancements

### Medium Priority
- New slash commands
- Additional configuration options
- Better error messages
- Documentation improvements

### Low Priority
- Code refactoring
- Development tool improvements
- Non-critical feature additions

---

Thank you for contributing to Discord Reminder Bot! Every contribution helps make the project better for the community. 🎉