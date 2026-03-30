import fs from 'fs';
import path from 'path';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { NestApplicationOptions, ValidationPipe } from '@nestjs/common';
import { TransformInterceptor } from './transform.interceptor';
import pkg from '../package.json';

async function bootstrap() {
  const keyPath = path.join(__dirname, '/../osaka.rainydev.top.key');
  const certPath = path.join(__dirname, '/../osaka.rainydev.top.crt');

  let httpsOptions: NestApplicationOptions['httpsOptions'] | undefined;

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    httpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
    console.log('Starting server with HTTPS');
  } else {
    console.warn('HTTPS certificates not found, falling back to HTTP');
  }

  const app = httpsOptions
    ? await NestFactory.create(AppModule, { httpsOptions })
    : await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  const config = new DocumentBuilder()
    .setTitle('Todos example')
    .setDescription('The todos API description')
    .setVersion(pkg.version)
    .addTag('todos')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: '*',
  });

  app.useGlobalInterceptors(new TransformInterceptor());

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
}
bootstrap();
