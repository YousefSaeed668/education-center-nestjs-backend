import { Injectable } from '@nestjs/common';
@Injectable()
export class HandleFiles {
  sanitizeFileName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9\u0600-\u06FF._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 100);
  }
}
