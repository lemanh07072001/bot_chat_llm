import { ServiceUnavailableException } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  const build = async (readyState: number): Promise<AppController> => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: getConnectionToken(), useValue: { readyState } },
      ],
    }).compile();

    return app.get<AppController>(AppController);
  };

  describe('root', () => {
    it('should return "Hello World!"', async () => {
      const controller = await build(1);

      expect(controller.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('reports ok while the database is connected', async () => {
      const controller = await build(1);

      expect(controller.health()).toMatchObject({ status: 'ok', db: true });
    });

    it('fails the probe while the database is disconnected', async () => {
      const controller = await build(0);

      expect(() => controller.health()).toThrow(ServiceUnavailableException);
    });
  });
});
