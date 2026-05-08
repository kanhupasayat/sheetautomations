import { useState, useMemo } from 'react'

function getAllMappedNames(groups) {
  const set = new Set()
  groups.forEach((g) => g.forEach((n) => set.add(n.trim().toLowerCase())))
  return set
}

function StaffMapping({ orderData, eodData, staffGroups, onUpdate }) {
  const [newGroupName, setNewGroupName] = useState('')
  const [addAliasIdx, setAddAliasIdx] = useState(null)
  const [aliasInput, setAliasInput] = useState('')
  const [assignName, setAssignName] = useState(null)
  const [search, setSearch] = useState('')

  const orderStaffNames = useMemo(() => {
    const set = new Set()
    orderData.forEach((r) => {
      const n = (r.supportStaff || '').trim()
      if (n) set.add(n)
    })
    return [...set].sort()
  }, [orderData])

  const eodAgentNames = useMemo(() => {
    const set = new Set()
    eodData.forEach((r) => {
      const n = (r.agentName || '').trim()
      if (n) set.add(n)
    })
    return [...set].sort()
  }, [eodData])

  const { unmatchedOrders, unmatchedEod } = useMemo(() => {
    const mapped = getAllMappedNames(staffGroups)
    return {
      unmatchedOrders: orderStaffNames.filter((n) => !mapped.has(n.toLowerCase())),
      unmatchedEod: eodAgentNames.filter((n) => !mapped.has(n.toLowerCase())),
    }
  }, [orderStaffNames, eodAgentNames, staffGroups])

  function addGroup() {
    const n = newGroupName.trim().toLowerCase()
    if (!n) return
    const exists = staffGroups.some((g) => g.some((x) => x.toLowerCase() === n))
    if (exists) {
      alert('This name is already in a group')
      return
    }
    onUpdate([...staffGroups, [n]])
    setNewGroupName('')
  }

  function deleteGroup(idx) {
    if (!confirm('Delete the entire group?')) return
    onUpdate(staffGroups.filter((_, i) => i !== idx))
  }

  function addAlias(idx) {
    const a = aliasInput.trim().toLowerCase()
    if (!a) return
    const exists = staffGroups.some((g) => g.some((n) => n.toLowerCase() === a))
    if (exists) {
      alert('This name is already in some group')
      return
    }
    const updated = staffGroups.map((g, i) => (i === idx ? [...g, a] : g))
    onUpdate(updated)
    setAliasInput('')
    setAddAliasIdx(null)
  }

  function deleteAlias(groupIdx, aliasIdx) {
    const updated = staffGroups
      .map((g, i) => (i !== groupIdx ? g : g.filter((_, j) => j !== aliasIdx)))
      .filter((g) => g.length > 0)
    onUpdate(updated)
  }

  function assignToGroup(groupIdx, name) {
    const lower = name.trim().toLowerCase()
    const updated = staffGroups.map((g, i) => (i === groupIdx ? [...g, lower] : g))
    onUpdate(updated)
    setAssignName(null)
  }

  function createGroupFromName(name) {
    const lower = name.trim().toLowerCase()
    onUpdate([...staffGroups, [lower]])
    setAssignName(null)
  }

  const filteredGroups = useMemo(() => {
    const withIdx = staffGroups.map((g, i) => ({ group: g, origIdx: i }))
    if (!search.trim()) return withIdx
    const s = search.toLowerCase()
    return withIdx.filter(({ group }) => group.some((n) => n.toLowerCase().includes(s)))
  }, [staffGroups, search])

  return (
    <div>
      <div className="stats-row">
        <div className="stat-box purple"><div className="num">{staffGroups.length}</div><div className="label">Total Groups</div></div>
        <div className="stat-box green"><div className="num">{staffGroups.reduce((s, g) => s + g.length, 0)}</div><div className="label">Total Names</div></div>
        <div className="stat-box red"><div className="num">{unmatchedOrders.length}</div><div className="label">Unmatched (Orders)</div></div>
        <div className="stat-box red"><div className="num">{unmatchedEod.length}</div><div className="label">Unmatched (EOD)</div></div>
      </div>

      {(unmatchedOrders.length > 0 || unmatchedEod.length > 0) && (
        <div className="match-section" style={{ marginBottom: 20 }}>
          <div className="match-section-title order-title">
            Unmatched Names - click to assign to a group
          </div>
          <div style={{ padding: 12 }}>
            {unmatchedOrders.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <strong>From Orders ({unmatchedOrders.length}):</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {unmatchedOrders.map((n) => (
                    <button key={n} className="unmatched-chip" onClick={() => setAssignName({ name: n, source: 'orders' })}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {unmatchedEod.length > 0 && (
              <div>
                <strong>From EOD ({unmatchedEod.length}):</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {unmatchedEod.map((n) => (
                    <button key={n} className="unmatched-chip" onClick={() => setAssignName({ name: n, source: 'eod' })}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {assignName && (
        <div className="assign-overlay" onClick={() => setAssignName(null)}>
          <div className="assign-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Where to assign "{assignName.name}"?</h3>
            <button className="setup-load-btn" style={{ marginBottom: 12 }} onClick={() => createGroupFromName(assignName.name)}>
              + Create New Group
            </button>
            <div className="assign-scroll">
              {staffGroups.map((g, i) => (
                <button key={i} className="assign-group-btn" onClick={() => assignToGroup(i, assignName.name)}>
                  <strong>{g[0]}</strong>
                  {g.length > 1 && <span style={{ marginLeft: 8, opacity: 0.65, fontSize: 12 }}>({g.slice(1).join(', ')})</span>}
                </button>
              ))}
            </div>
            <button className="clear-btn" style={{ marginTop: 12 }} onClick={() => setAssignName(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="filters">
        <div className="filter-group">
          <label>Create New Group</label>
          <input
            type="text"
            placeholder="Type name and press Enter..."
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addGroup()}
          />
        </div>
        <div className="filter-group" style={{ alignSelf: 'flex-end', minWidth: 'auto' }}>
          <button className="setup-load-btn" style={{ padding: '10px 20px', width: 'auto' }} onClick={addGroup}>
            + Add Group
          </button>
        </div>
        <div className="filter-group">
          <label>Search Group</label>
          <input type="text" placeholder="Search name..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="table-container">
        {filteredGroups.length === 0 ? (
          <div className="no-data">No group found</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Primary Name</th>
                <th>Aliases (alternate names)</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredGroups.map(({ group, origIdx }, i) => (
                <tr key={origIdx}>
                  <td>{i + 1}</td>
                  <td><strong>{group[0]}</strong></td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      {group.slice(1).map((alias, j) => (
                        <span key={j} className="alias-chip">
                          {alias}
                          <button className="chip-x" onClick={() => deleteAlias(origIdx, j + 1)} title="Remove">×</button>
                        </span>
                      ))}
                      {addAliasIdx === origIdx ? (
                        <span style={{ display: 'flex', gap: 4 }}>
                          <input
                            type="text"
                            placeholder="Alias..."
                            value={aliasInput}
                            autoFocus
                            onChange={(e) => setAliasInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') addAlias(origIdx)
                              if (e.key === 'Escape') { setAddAliasIdx(null); setAliasInput('') }
                            }}
                            style={{ padding: '4px 8px', fontSize: 13, border: '1px solid #cbd5e1', borderRadius: 4 }}
                          />
                          <button className="chip-add" onClick={() => addAlias(origIdx)}>Add</button>
                          <button className="chip-cancel" onClick={() => { setAddAliasIdx(null); setAliasInput('') }}>×</button>
                        </span>
                      ) : (
                        <button className="chip-add" onClick={() => { setAddAliasIdx(origIdx); setAliasInput('') }}>+ Alias</button>
                      )}
                    </div>
                  </td>
                  <td>
                    <button className="chip-delete-group" onClick={() => deleteGroup(origIdx)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default StaffMapping
