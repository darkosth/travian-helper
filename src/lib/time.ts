export const formatRelativeTime = (value?: Date | string | null) => {
  if (!value) {
    return "Never";
  }

  const date = value instanceof Date ? value : new Date(value);
  const diffMs = Date.now() - date.getTime();
  const future = diffMs < 0;
  const absoluteDiffMs = Math.abs(diffMs);

  if (absoluteDiffMs < 60_000) {
    return future ? "In <1m" : "Just now";
  }

  const minutes = Math.round(absoluteDiffMs / 60_000);

  if (minutes < 60) {
    return future ? `In ${minutes}m` : `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return future ? `In ${hours}h` : `${hours}h ago`;
  }

  const days = Math.round(hours / 24);

  return future ? `In ${days}d` : `${days}d ago`;
};
