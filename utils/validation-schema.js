/**
 * Request Validation Schemas
 * Improves code quality through centralized, reusable validation rules
 * Makes validation logic DRY and maintainable
 */

const {
  validateUsername,
  validateEmail,
  validateDate,
  validateSleepGoal
} = require('../middleware/security');

class ValidationSchema {
  constructor(rules) {
    this.rules = rules;
  }

  /**
   * Validate request body against schema
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  validate(data) {
    const errors = [];

    for (const [field, rule] of Object.entries(this.rules)) {
      const value = data?.[field];

      // Check if field is required
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }

      // Skip validation if field not provided and not required
      if (!rule.required && (value === undefined || value === null)) {
        continue;
      }

      // Run custom validator if provided
      if (rule.validator) {
        const isValid = rule.validator(value);
        if (!isValid) {
          errors.push(rule.message || `${field} is invalid`);
        }
      }

      // Type checking
      if (rule.type && typeof value !== rule.type) {
        errors.push(`${field} must be a ${rule.type}`);
      }

      // Min/Max length
      if (rule.minLength && value.length < rule.minLength) {
        errors.push(`${field} must be at least ${rule.minLength} characters`);
      }

      if (rule.maxLength && value.length > rule.maxLength) {
        errors.push(`${field} must be at most ${rule.maxLength} characters`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Profile update validation
const profileUpdateSchema = new ValidationSchema({
  name: {
    required: false,
    type: 'string',
    maxLength: 100,
    message: 'Name must be a valid string (max 100 chars)'
  },
  exam: {
    required: false,
    type: 'string',
    maxLength: 100,
    message: 'Exam must be a valid string (max 100 chars)'
  },
  target_date: {
    required: false,
    type: 'string',
    validator: validateDate,
    message: 'Target date must be a future date'
  },
  sleep_goal_hours: {
    required: false,
    type: 'number',
    validator: validateSleepGoal,
    message: 'Sleep goal must be between 4 and 12 hours'
  }
});

// Journal submission validation
const journalSubmissionSchema = new ValidationSchema({
  text: {
    required: true,
    type: 'string',
    minLength: 10,
    maxLength: 5000,
    message: 'Journal entry must be 10-5000 characters'
  }
});

// Chat message validation
const chatMessageSchema = new ValidationSchema({
  message: {
    required: true,
    type: 'string',
    minLength: 1,
    maxLength: 2000,
    message: 'Message must be 1-2000 characters'
  }
});

// User registration validation
const userRegistrationSchema = new ValidationSchema({
  username: {
    required: true,
    type: 'string',
    validator: validateUsername,
    message: 'Username must be 3-32 alphanumeric characters'
  }
});

module.exports = {
  ValidationSchema,
  profileUpdateSchema,
  journalSubmissionSchema,
  chatMessageSchema,
  userRegistrationSchema
};
