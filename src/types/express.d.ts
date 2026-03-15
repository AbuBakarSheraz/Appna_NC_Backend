import 'express';

declare module 'express' {
  interface Request {
    cookies: {
      [key: string]: string;
    };
  }
}
