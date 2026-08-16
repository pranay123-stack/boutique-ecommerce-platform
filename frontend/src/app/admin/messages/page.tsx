'use client';

import { useState } from 'react';
import { Loader2, Mail, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAdminContactMessages, useUpdateContactMessage } from '@/hooks/use-admin';
import { formatDateTime, humanizeStatus } from '@/lib/format';
import type { ContactStatus } from '@/types';

const STATUSES: Array<{ value: string; label: string }> = [
  { value: '', label: 'All messages' },
  { value: 'NEW', label: 'New' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'SPAM', label: 'Spam' },
];

const TONE: Record<ContactStatus, 'default' | 'success' | 'warning' | 'destructive'> = {
  NEW: 'warning',
  IN_PROGRESS: 'default',
  RESOLVED: 'success',
  SPAM: 'destructive',
};

export default function AdminMessagesPage() {
  const [status, setStatus] = useState('NEW');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAdminContactMessages({ page, status, search });
  const update = useUpdateContactMessage();

  const messages = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="display-heading text-3xl font-semibold">Messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything sent through the contact form. Stored here as well as emailed, so nothing is
          lost if an inbox is.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Label htmlFor="message-search" className="sr-only">
            Search messages
          </Label>
          <Input
            id="message-search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Email, subject or order number"
            className="pl-9"
          />
        </div>
        <Label htmlFor="message-status" className="sr-only">
          Filter by status
        </Label>
        <select
          id="message-status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : messages.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <Mail className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-4 text-sm text-muted-foreground">Nothing here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {messages.map((message) => (
            <Card key={message.id}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="font-medium">{message.subject}</h2>
                      <Badge variant={TONE[message.status]}>
                        {humanizeStatus(message.status)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {message.name} ·{' '}
                      <a
                        href={`mailto:${message.email}?subject=${encodeURIComponent(`Re: ${message.subject}`)}`}
                        className="underline underline-offset-4"
                      >
                        {message.email}
                      </a>
                      {message.phone ? ` · ${message.phone}` : ''}
                      {message.orderNumber ? ` · ${message.orderNumber}` : ''}
                    </p>
                  </div>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(message.createdAt)}
                  </span>
                </div>

                <p className="mt-3 whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">
                  {message.message}
                </p>

                {message.staffNote ? (
                  <p className="mt-2 text-xs text-muted-foreground">Note: {message.staffNote}</p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  {(['IN_PROGRESS', 'RESOLVED', 'SPAM'] as ContactStatus[])
                    .filter((s) => s !== message.status)
                    .map((target) => (
                      <Button
                        key={target}
                        size="sm"
                        variant={target === 'SPAM' ? 'outline' : 'default'}
                        loading={update.isPending}
                        onClick={() => update.mutate({ id: message.id, status: target })}
                      >
                        Mark {humanizeStatus(target).toLowerCase()}
                      </Button>
                    ))}
                  <Button asChild size="sm" variant="outline">
                    <a
                      href={`mailto:${message.email}?subject=${encodeURIComponent(`Re: ${message.subject}`)}`}
                    >
                      Reply
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {data?.meta && data.meta.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {data.meta.page} of {data.meta.totalPages} · {data.meta.total} messages
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!data.meta.hasPrevious} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={!data.meta.hasNext} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
