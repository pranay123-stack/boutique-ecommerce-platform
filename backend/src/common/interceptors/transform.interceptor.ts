import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface ApiEnvelope<T> {
  success: true;
  data: T;
  meta?: unknown;
}

/**
 * Wraps every successful response in a consistent envelope so clients can rely
 * on one shape. Paginated services return `{ items, meta }`; we lift `meta` to
 * the top level and expose `items` as `data`.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiEnvelope<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiEnvelope<T>> {
    return next.handle().pipe(
      map((payload) => {
        if (
          payload &&
          typeof payload === 'object' &&
          'items' in payload &&
          'meta' in payload &&
          Object.keys(payload).length === 2
        ) {
          const p = payload as { items: T; meta: unknown };
          return { success: true as const, data: p.items, meta: p.meta };
        }
        return { success: true as const, data: payload as T };
      }),
    );
  }
}
