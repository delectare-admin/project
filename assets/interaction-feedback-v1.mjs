// Local display state only. Authorization, validation and writes stay on the server.
export function createRatingFeedback(context) {
  const pending = new Map();
  const key = (kind, id) => kind + ':' + id;
  const current = operation => {
    const value = context();
    return operation && operation.uid === value.uid && operation.videoId === value.videoId;
  };
  const find = (kind, id) => {
    const operation = pending.get(key(kind, id));
    return current(operation) ? operation : null;
  };
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  return {
    begin(kind, id, previous, value, data = {}) {
      const operation = {...context(), kind, id, previous, value,
        revision: count(data.ratingRevision)};
      pending.set(key(kind, id), operation);
      return operation;
    },
    selection(kind, id, fallback) {
      const operation = find(kind, id);
      return operation ? operation.value : fallback;
    },
    counts(kind, id, data) {
      const operation = find(kind, id);
      let likes = count(data.likes), dislikes = count(data.dislikes);
      // A newer public snapshot is authoritative: do not add our preview twice.
      if (operation && count(data.ratingRevision) <= operation.revision) {
        likes = Math.max(0, likes + Number(operation.value === 'like') - Number(operation.previous === 'like'));
        dislikes = Math.max(0, dislikes + Number(operation.value === 'dislike') - Number(operation.previous === 'dislike'));
      }
      return {likes, dislikes};
    },
    has(kind, id) { return !!find(kind, id); },
    finish(operation) {
      if (pending.get(key(operation.kind, operation.id)) === operation) pending.delete(key(operation.kind, operation.id));
    },
    clear() { pending.clear(); }
  };
}
