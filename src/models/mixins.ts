/**
 * Mixins for model validation and serialization
 *
 * Provides reusable functionality that can be mixed into model classes
 */

import type { ModelValidationError } from './BaseModel';

/**
 * Validation mixin interface
 */
export interface ValidationMixin {
  validate(): ModelValidationError[];
  fullClean(): void;
}

/**
 * Serialization mixin interface
 */
export interface SerializationMixin {
  toDict(): Record<string, any>;
  toJSON(): Record<string, any>;
}

/**
 * Combined model interface with both mixins
 */
export interface ModelMixin extends ValidationMixin, SerializationMixin {
  toString(): string;
}

/**
 * Utility functions for model operations
 */
export class ModelUtils {
  /**
   * Validate multiple models and collect all errors
   */
  static validateModels(models: ValidationMixin[]): ModelValidationError[] {
    const allErrors: ModelValidationError[] = [];

    models.forEach((model, index) => {
      const errors = model.validate();
      errors.forEach(error => {
        allErrors.push({
          field: `model[${index}].${error.field}`,
          message: error.message,
        });
      });
    });

    return allErrors;
  }

  /**
   * Perform full clean on multiple models
   */
  static fullCleanModels(models: ValidationMixin[]): void {
    const errors = this.validateModels(models);
    if (errors.length > 0) {
      const errorMessages = errors.map(e => `${e.field}: ${e.message}`).join(', ');
      throw new Error(`Validation failed: ${errorMessages}`);
    }
  }

  /**
   * Serialize multiple models to dictionaries
   */
  static serializeModels(models: SerializationMixin[]): Record<string, any>[] {
    return models.map(model => model.toDict());
  }

  /**
   * Serialize multiple models to JSON format
   */
  static jsonifyModels(models: SerializationMixin[]): Record<string, any>[] {
    return models.map(model => model.toJSON());
  }
}

/**
 * Helper for creating model collections with validation
 */
export class ModelCollection<T extends ValidationMixin & SerializationMixin> {
  private models: T[] = [];

  constructor(models: T[] = []) {
    this.models = [...models];
  }

  /**
   * Add a model to the collection
   */
  add(model: T): void {
    model.fullClean(); // Validate before adding
    this.models.push(model);
  }

  /**
   * Add multiple models to the collection
   */
  addAll(models: T[]): void {
    models.forEach(model => this.add(model));
  }

  /**
   * Remove a model from the collection
   */
  remove(model: T): boolean {
    const index = this.models.indexOf(model);
    if (index >= 0) {
      this.models.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get all models in the collection
   */
  getAll(): T[] {
    return [...this.models];
  }

  /**
   * Find models matching a predicate
   */
  find(predicate: (model: T) => boolean): T[] {
    return this.models.filter(predicate);
  }

  /**
   * Find first model matching a predicate
   */
  findFirst(predicate: (model: T) => boolean): T | undefined {
    return this.models.find(predicate);
  }

  /**
   * Get the number of models in the collection
   */
  count(): number {
    return this.models.length;
  }

  /**
   * Check if the collection is empty
   */
  isEmpty(): boolean {
    return this.models.length === 0;
  }

  /**
   * Clear all models from the collection
   */
  clear(): void {
    this.models = [];
  }

  /**
   * Validate all models in the collection
   */
  validate(): ModelValidationError[] {
    return ModelUtils.validateModels(this.models);
  }

  /**
   * Perform full clean on all models in the collection
   */
  fullClean(): void {
    ModelUtils.fullCleanModels(this.models);
  }

  /**
   * Serialize all models to dictionaries
   */
  toDict(): Record<string, any>[] {
    return ModelUtils.serializeModels(this.models);
  }

  /**
   * Serialize all models to JSON format
   */
  toJSON(): Record<string, any>[] {
    return ModelUtils.jsonifyModels(this.models);
  }
}
