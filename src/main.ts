import { BadRequestException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ValidationError } from 'class-validator';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/Filters/AllExceptionsFilter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { PrismaExceptionFilter } from './filters/prisma-exception.filter';
import { MultipartValidationPipe } from './pipes/multipart-validation.pipe';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new MultipartValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
        excludeExtraneousValues: false,
        exposeDefaultValues: true,
      },
      exceptionFactory: (errors) => {
        const formatErrors = (
          errors: ValidationError[],
          parentPath = '',
        ): string[] => {
          return errors.flatMap((error) => {
            const messages: string[] = [];

            if (error.constraints) {
              messages.push(...Object.values(error.constraints));
            }

            if (error.children && error.children.length > 0) {
              messages.push(...formatErrors(error.children, error.property));
            }

            return messages;
          });
        };

        const formattedErrors = formatErrors(errors);
        return new BadRequestException(formattedErrors);
      },
    }),
  );
  app.useGlobalFilters(new PrismaExceptionFilter(), new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  await app.listen(process.env.PORT ?? 8000);
}
bootstrap();
