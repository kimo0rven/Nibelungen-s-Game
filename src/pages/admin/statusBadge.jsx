const STATUS_LABEL = { draft: 'Draft', lobby: 'Lobby open', live: 'Live', finished: 'Finished' }

export function StatusBadge({ status }) {
  return <span className={`badge ${status}`}>{STATUS_LABEL[status]}</span>
}
