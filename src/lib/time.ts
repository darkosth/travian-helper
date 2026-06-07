export const formatRelativeTime = (value?: Date | string | null) => {
  if (!value) {
    return "Never";
  }

  const date = value instanceof Date ? value : new Date(value);
  const diffMs = Date.now() - date.getTime();

  if (diffMs < 60_000) {
    return "Just now";
  }

  const minutes = Math.round(diffMs / 60_000);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.round(hours / 24);

  return `${days}d ago`;
};
