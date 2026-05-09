import React, { useState, useEffect } from 'react'
import { db } from '../firebase'
import { collection, query, where, getDocs, limit } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'

const UniversalSearch: React.FC = () => {
  const [searchTerm, setSearchQuery] = useState('')
  const [results, setResults] = useState<{ users: any[], posts: any[] }>({ users: [], posts: [] })
  const [showResults, setShowResults] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchTerm.length >= 2) {
        performSearch()
      } else {
        setResults({ users: [], posts: [] })
        setShowResults(false)
      }
    }, 500)

    return () => clearTimeout(delayDebounceFn)
  }, [searchTerm])

  const performSearch = async () => {
    setIsSearching(true)
    setShowResults(true) // Ensure box shows immediately
    try {
      const lowerSearch = searchTerm.toLowerCase()
      const usersRef = collection(db, "users")
      
      // Parallel Search: Search both original and lowercase fields to catch all users
      const qLower = query(usersRef, where("usernameLowercase", ">=", lowerSearch), where("usernameLowercase", "<=", lowerSearch + '\uf8ff'), limit(10))
      const qOrig = query(usersRef, where("username", ">=", searchTerm), where("username", "<=", searchTerm + '\uf8ff'), limit(10))

      const [snapLower, snapOrig] = await Promise.all([
        getDocs(qLower).catch(() => ({ docs: [] })), 
        getDocs(qOrig).catch(() => ({ docs: [] }))
      ])

      // Deduplicate results by user ID
      const usersMap = new Map()
      snapLower.docs.forEach(doc => usersMap.set(doc.id, { id: doc.id, ...doc.data() }))
      snapOrig.docs.forEach(doc => usersMap.set(doc.id, { id: doc.id, ...doc.data() }))
      const foundUsers = Array.from(usersMap.values()).slice(0, 5)

      // Search Posts by caption (contains location or bike info usually)
      const postsRef = collection(db, "posts")
      const postQuery = query(postsRef, limit(20))
      const postSnap = await getDocs(postQuery)
      const foundPosts = postSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((p: any) => p.caption?.toLowerCase().includes(lowerSearch))
        .slice(0, 5)

      setResults({ users: foundUsers, posts: foundPosts })
    } catch (e) {
      console.error("Search failed", e)
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div style={{ position: 'relative', flex: 1, maxWidth: '400px', margin: '0 1rem' }}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          placeholder="Search riders, locations, routes..."
          value={searchTerm}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => searchTerm.length >= 2 && setShowResults(true)}
          style={{
            width: '100%',
            padding: '0.6rem 1rem 0.6rem 2.5rem',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid #333',
            borderRadius: '20px',
            color: 'white',
            fontSize: '0.85rem',
            outline: 'none'
          }}
        />
        <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
        {isSearching && (
           <span style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.7rem', color: '#ff6600' }}>...</span>
        )}
      </div>

      {showResults && (searchTerm.length >= 2) && (
        <div style={{
          position: 'absolute',
          top: '110%',
          left: 0,
          right: 0,
          background: '#1e1e1e',
          border: '1px solid #333',
          borderRadius: '12px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          zIndex: 1000,
          maxHeight: '400px',
          overflowY: 'auto'
        }}>
          {results.users.length > 0 && (
            <div style={{ padding: '0.8rem' }}>
              <label style={{ fontSize: '0.6rem', color: '#666', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'block' }}>Riders</label>
              {results.users.map(u => (
                <div 
                  key={u.id} 
                  onClick={() => { navigate(`/profile/${u.username}`); setShowResults(false); setSearchQuery(''); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.5rem', cursor: 'pointer', borderRadius: '8px' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,102,0,0.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#333', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {u.profilePic ? <img src={u.profilePic} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🚲'}
                  </div>
                  <span style={{ color: 'white', fontSize: '0.9rem' }}>{u.username}</span>
                </div>
              ))}
            </div>
          )}

          {results.posts.length > 0 && (
            <div style={{ padding: '0.8rem', borderTop: '1px solid #333' }}>
              <label style={{ fontSize: '0.6rem', color: '#666', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'block' }}>Shared Trips</label>
              {results.posts.map(p => (
                <div 
                  key={p.id} 
                  onClick={() => { navigate('/feed'); setShowResults(false); setSearchQuery(''); }}
                  style={{ padding: '0.5rem', cursor: 'pointer', borderRadius: '8px' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,102,0,0.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ color: 'white', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.caption}</div>
                  <div style={{ fontSize: '0.7rem', color: '#666' }}>by {p.authorUsername}</div>
                </div>
              ))}
            </div>
          )}

          {results.users.length === 0 && results.posts.length === 0 && !isSearching && (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#666', fontSize: '0.8rem' }}>No matches found</div>
          )}
        </div>
      )}
      
      {showResults && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: -1 }} onClick={() => setShowResults(false)} />}
    </div>
  )
}

export default UniversalSearch
