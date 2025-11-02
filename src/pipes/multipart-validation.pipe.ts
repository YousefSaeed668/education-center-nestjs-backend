import { ArgumentMetadata, Injectable, ValidationPipe } from '@nestjs/common';

@Injectable()
export class MultipartValidationPipe extends ValidationPipe {
  async transform(value: any, metadata: ArgumentMetadata) {
    // Check if this is a multipart/form-data request by looking for common patterns
    if (this.isMultipartData(value)) {
      // Transform string fields that should be arrays or objects
      value = this.transformMultipartFields(value);
    }

    // Apply the normal validation pipe transformation
    return super.transform(value, metadata);
  }

  private isMultipartData(value: any): boolean {
    if (!value || typeof value !== 'object') {
      return false;
    }

    // Check for common patterns that indicate multipart/form-data
    return Object.keys(value).some((key) => {
      const val = value[key];
      return typeof val === 'string' && this.looksLikeJSONString(val);
    });
  }

  private looksLikeJSONString(str: string): boolean {
    if (typeof str !== 'string') return false;

    // Check if string looks like JSON array or object
    const trimmed = str.trim();
    return (
      (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      (trimmed.startsWith('{') && trimmed.endsWith('}'))
    );
  }

  private transformMultipartFields(value: any): any {
    const transformed = { ...value };

    // List of fields that should be transformed from JSON strings
    const fieldsToTransform = [
      'lectureContents',
      'courseFeatures',
      'deletedContentIds',
      'files',
      // Add more fields as needed
    ];
    fieldsToTransform.forEach((field) => {
      if (transformed[field] && typeof transformed[field] === 'string') {
        try {
          const parsed = JSON.parse(transformed[field]);
          // Only replace if parsing was successful and result is array or object
          if (
            Array.isArray(parsed) ||
            (typeof parsed === 'object' && parsed !== null)
          ) {
            transformed[field] = parsed;
          }
        } catch {
          // If parsing fails, keep the original value
          // The validation pipe will handle the error appropriately
        }
      }
    });

    return transformed;
  }
}
