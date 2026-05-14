import re

path = "/home/matty/Range-Anxiety/src/pages/Profile.tsx"
with open(path, "r") as f:
    content = f.read()

# 1. Add activeTab state
if "const [activeTab, setActiveTab]" not in content:
    content = content.replace(
        "const [isFollowing, setIsFollowing] = useState(false);",
        "const [activeTab, setActiveTab] = useState('garage');\n  const [isFollowing, setIsFollowing] = useState(false);"
    )

# 2. Add the rating UI above username
rating_ui = """</div>
              
              {profileData.ratingCount > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginBottom: '0.8rem', marginTop: '0.5rem' }}>
                  <div style={{ color: '#ffcc00', fontSize: '1.2rem' }}>
                    {'★'.repeat(Math.round(profileData.averageRating || 0))}{'☆'.repeat(5 - Math.round(profileData.averageRating || 0))}
                  </div>
                  <span style={{ color: '#888', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    {(profileData.averageRating || 0).toFixed(1)} ({profileData.ratingCount})
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.6rem' }}>"""

if "profileData.ratingCount > 0" not in content:
    content = content.replace(
        "</div>\n              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.6rem' }}>",
        rating_ui
    )

# 3. Replace the three sections with tabs
pattern = r'\{profileData\?\.bikes && \([\s\S]*?</section>\s*\)\}\s*<section>[\s\S]*?</section>\s*<section style=\{\{ marginTop: \'4rem\', paddingBottom: \'6rem\' \}\}>[\s\S]*?</section>'

tabs_ui = """
            <div style={{ display: 'flex', borderBottom: '1px solid #333', marginBottom: '2rem' }}>
              <button 
                onClick={() => setActiveTab('garage')}
                style={{ flex: 1, padding: '1rem', background: 'none', border: 'none', borderBottom: activeTab === 'garage' ? '2px solid #ff6600' : '2px solid transparent', color: activeTab === 'garage' ? 'white' : '#888', fontWeight: 'bold', cursor: 'pointer' }}
              >Garage</button>
              <button 
                onClick={() => setActiveTab('ride')}
                style={{ flex: 1, padding: '1rem', background: 'none', border: 'none', borderBottom: activeTab === 'ride' ? '2px solid #ff6600' : '2px solid transparent', color: activeTab === 'ride' ? 'white' : '#888', fontWeight: 'bold', cursor: 'pointer' }}
              >Ride</button>
              <button 
                onClick={() => setActiveTab('reviews')}
                style={{ flex: 1, padding: '1rem', background: 'none', border: 'none', borderBottom: activeTab === 'reviews' ? '2px solid #ff6600' : '2px solid transparent', color: activeTab === 'reviews' ? 'white' : '#888', fontWeight: 'bold', cursor: 'pointer' }}
              >Reviews ({profileData.ratingCount || 0})</button>
            </div>

            {activeTab === 'garage' && (
              <section style={{ marginBottom: '4rem' }}>
                {!profileData.bikes || profileData.bikes.length === 0 ? (
                  <div style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>No bikes in garage yet.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
                    {profileData.bikes.map((bike: any, idx: number) => (
                      <div key={bike.id || idx} style={{ background: '#1a1a1a', borderRadius: '12px', border: '1px solid #333', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ width: '100%', aspectRatio: '1/1', background: '#222' }}>
                          {bike.image ? <img src={bike.image} alt={bike.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>🚲</div>}
                        </div>
                        <div style={{ padding: '0.8rem' }}>
                          <div style={{ fontWeight: 'bold', color: 'white', fontSize: '0.85rem' }}>{bike.name}</div>
                          <div style={{ fontSize: '0.7rem', color: '#888' }}>{bike.specs.voltage}V {bike.specs.capacityAh}Ah</div>
                        </div>
                        {canEdit && <button onClick={() => removeBike(bike)} style={{ position: 'absolute', bottom: '0.5rem', right: '0.5rem', background: 'none', border: 'none', color: isAdmin ? '#ff4444' : '#444', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeTab === 'ride' && (
              <section style={{ marginBottom: '4rem' }}>
                {userPosts.length === 0 ? (
                  <div style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>No rides shared yet.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    {userPosts.map(post => (
                      <div key={post.id} style={{ background: '#1a1a1a', borderRadius: '16px', border: '1px solid #333', overflow: 'hidden', position: 'relative' }}>
                        <img src={post.imageUrl} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover' }} alt="Ride" />
                        {isAdmin && (
                          <button 
                            onClick={async () => {
                              const reason = promptForModerationReason("post deletion");
                              if (reason === null) return;
                              await deleteDoc(doc(db, "posts", post.id));
                              await createNotification(
                                post.authorId,
                                user.uid,
                                "System Admin",
                                'moderation',
                                'deleted_post',
                                `Your post was removed by a moderator. Reason: ${reason}`
                              );
                            }}
                            style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '4px', padding: '4px', cursor: 'pointer' }}
                          >🗑️</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeTab === 'reviews' && (
              <section style={{ marginBottom: '4rem' }}>
                {userReviews.length === 0 ? (
                  <div style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>No reviews yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {userReviews.map(review => (
                      <div key={review.id} style={{ background: '#1a1a1a', padding: '1.2rem', borderRadius: '16px', border: '1px solid #333', position: 'relative' }}>
                        {isAdmin && (
                          <button 
                            onClick={async () => {
                              const reason = promptForModerationReason("review deletion");
                              if (reason === null) return;
                              await deleteDoc(doc(db, "rider_reviews", review.id));
                              await createNotification(
                                review.reviewerId,
                                user.uid,
                                "System Admin",
                                'moderation',
                                'deleted_review',
                                `Your review for ${profileData.username} was removed. Reason: ${reason}`
                              );
                            }}
                            style={{ position: 'absolute', top: '1.2rem', right: '1.2rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}
                          >🗑️</button>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#333', overflow: 'hidden' }}>{review.reviewerProfilePic ? <img src={review.reviewerProfilePic} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Reviewer" /> : '🚲'}</div>
                            <span style={{ fontWeight: 'bold', color: 'white', fontSize: '0.9rem' }}>{review.reviewerUsername}</span>
                          </div>
                          <div style={{ color: '#ffcc00' }}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</div>
                        </div>
                        <p style={{ color: '#ccc', margin: 0, fontSize: '0.95rem', lineHeight: '1.5' }}>{review.comment}</p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                          <div style={{ fontSize: '0.7rem', color: '#444' }}>{review.createdAt?.toDate().toLocaleDateString()}</div>
                          <button onClick={() => { setActiveReviewForComments(review.id); fetchReviewComments(review.id); }} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}>💬 {reviewComments[review.id]?.length || 0} Comments</button>
                        </div>
                        {activeReviewForComments === review.id && (
                          <div style={{ marginTop: '1.5rem', borderTop: '1px solid #222', paddingTop: '1rem' }}>
                            {reviewComments[review.id]?.map(c => (
                              <div key={c.id} style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.8rem' }}>
                                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#333', overflow: 'hidden' }}>{c.authorProfilePic ? <img src={c.authorProfilePic} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Commenter" /> : '🚲'}</div>
                                <div style={{ background: '#222', padding: '0.6rem 0.8rem', borderRadius: '12px', flex: 1, position: 'relative' }}>
                                  <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'white' }}>{c.authorUsername}</div>
                                  <div style={{ fontSize: '0.85rem', color: '#bbb' }}>{c.text}</div>
                                  {isAdmin && (
                                    <button 
                                      onClick={async () => {
                                        if (window.confirm("Delete this comment as moderator?")) {
                                          await deleteDoc(doc(db, `rider_reviews/${review.id}/comments`, c.id));
                                        }
                                      }}
                                      style={{ position: 'absolute', top: '0.4rem', right: '0.4rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.7rem' }}
                                    >🗑️</button>
                                  )}
                                </div>
                              </div>
                            ))}
                            {user && (
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input value={newReviewCommentText} onChange={(e) => setNewReviewCommentText(e.target.value)} placeholder="Write a reply..." style={{ flex: 1, background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white', padding: '0.5rem 0.8rem' }} />
                                <button onClick={() => handleSubmitReviewComment(review.id)} style={{ background: '#ff6600', color: 'white', border: 'none', borderRadius: '8px', padding: '0 1rem', fontWeight: 'bold' }}>Send</button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}"""

content = re.sub(pattern, tabs_ui, content, flags=re.DOTALL)

with open(path, "w") as f:
    f.write(content)

