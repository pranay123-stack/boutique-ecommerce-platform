'use client';

import { useState } from 'react';
import { MapPin, Plus, Trash2, Pencil } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useAddresses, useDeleteAddress, useSaveAddress } from '@/hooks/use-account';
import type { Address } from '@/types';

const EMPTY: Address = {
  label: '', fullName: '', phone: '', line1: '', line2: '', city: '', state: '', postalCode: '', country: 'IN',
  isDefaultShipping: false,
};

export default function AddressesPage() {
  const { data: addresses, isLoading } = useAddresses();
  const saveAddress = useSaveAddress();
  const deleteAddress = useDeleteAddress();
  const [editing, setEditing] = useState<(Address & { id?: string }) | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    saveAddress.mutate(editing, { onSuccess: () => setEditing(null) });
  };

  const field = (name: keyof Address, label: string, required = true) => (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        required={required}
        value={(editing?.[name] as string) ?? ''}
        onChange={(e) => setEditing((a) => (a ? { ...a, [name]: e.target.value } : a))}
        className="mt-1.5"
      />
    </div>
  );

  if (isLoading) return <div className="text-muted-foreground">Loading addresses…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Saved addresses</h2>
        <Button onClick={() => setEditing({ ...EMPTY })}>
          <Plus className="h-4 w-4" /> Add address
        </Button>
      </div>

      {!addresses?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <MapPin className="h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 font-medium">No addresses saved</p>
            <p className="mt-1 text-sm text-muted-foreground">Add one to speed up checkout.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {addresses.map((address) => (
            <Card key={address.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{address.label || address.fullName}</p>
                    {address.isDefaultShipping ? (
                      <Badge variant="secondary" className="mt-1">Default</Badge>
                    ) : null}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" aria-label="Edit address" onClick={() => setEditing({ ...address })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Delete address"
                      onClick={() => address.id && deleteAddress.mutate(address.id)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                </div>
                <address className="mt-3 text-sm not-italic leading-relaxed text-muted-foreground">
                  {address.fullName}<br />
                  {address.line1}{address.line2 ? `, ${address.line2}` : ''}<br />
                  {address.city}, {address.state} {address.postalCode}<br />
                  {address.phone}
                </address>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit address' : 'Add address'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {field('label', 'Label (e.g. Home)', false)}
            {field('fullName', 'Full name')}
            {field('phone', 'Phone')}
            {field('line1', 'Address line 1')}
            {field('line2', 'Address line 2', false)}
            <div className="grid grid-cols-2 gap-4">
              {field('city', 'City')}
              {field('state', 'State')}
            </div>
            {field('postalCode', 'PIN code')}
            <div className="flex items-center gap-2">
              <Checkbox
                id="isDefaultShipping"
                checked={editing?.isDefaultShipping ?? false}
                onCheckedChange={(v) => setEditing((a) => (a ? { ...a, isDefaultShipping: Boolean(v) } : a))}
              />
              <Label htmlFor="isDefaultShipping" className="cursor-pointer font-normal">
                Use as my default address
              </Label>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" loading={saveAddress.isPending}>Save address</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
