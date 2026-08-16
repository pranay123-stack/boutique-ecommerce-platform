'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useProfile, useUpdateProfile } from '@/hooks/use-account';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { toast } from 'sonner';

export default function ProfilePage() {
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        firstName: profile.firstName ?? '',
        lastName: profile.lastName ?? '',
        phone: profile.phone ?? '',
      });
    }
  }, [profile]);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChanging(true);
    try {
      await api.post('/auth/change-password', passwords);
      toast.success('Password updated - please sign in again');
      setPasswords({ currentPassword: '', newPassword: '' });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not change password');
    } finally {
      setChanging(false);
    }
  };

  if (isLoading) return <div className="text-muted-foreground">Loading profile…</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Personal details</CardTitle>
          <CardDescription>
            {profile?.email}
            {profile?.emailVerified ? (
              <Badge variant="success" className="ml-2">Verified</Badge>
            ) : (
              <Badge variant="warning" className="ml-2">Unverified</Badge>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); updateProfile.mutate(form); }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="firstName">First name</Label>
                <Input id="firstName" value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="lastName">Last name</Label>
                <Input id="lastName" value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="mt-1.5" />
              </div>
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" type="tel" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1.5" />
            </div>
            <Button type="submit" loading={updateProfile.isPending}>Save changes</Button>
          </form>

          <Separator className="my-6" />

          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Member since</dt>
              <dd className="mt-0.5 font-medium">{formatDate(profile?.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Orders placed</dt>
              <dd className="mt-0.5 font-medium">{profile?._count?.orders ?? 0}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Reviews written</dt>
              <dd className="mt-0.5 font-medium">{profile?._count?.reviews ?? 0}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Changing your password signs out all other devices</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={changePassword}>
            <div>
              <Label htmlFor="currentPassword">Current password</Label>
              <Input id="currentPassword" type="password" required autoComplete="current-password"
                value={passwords.currentPassword}
                onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
                className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="newPassword">New password</Label>
              <Input id="newPassword" type="password" required autoComplete="new-password"
                value={passwords.newPassword}
                onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                className="mt-1.5" />
            </div>
            <Button type="submit" variant="outline" loading={changing}>Update password</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
