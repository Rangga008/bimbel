import { cn } from '@/lib/utils';
import { resolveAssetUrl } from '@/lib/api-client';

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

/** Avatar user dengan foto profil (fallback inisial) — dipakai di semua list/picker. */
export function UserAvatar({
  name,
  avatarUrl,
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  className?: string;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={resolveAssetUrl(avatarUrl)} alt={name} className={cn('size-8 shrink-0 rounded-full object-cover', className)} />
    );
  }
  return (
    <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-blue-100 text-xs font-semibold text-brand-blue-700', className)}>
      {initials(name)}
    </span>
  );
}
