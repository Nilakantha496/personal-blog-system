document.addEventListener('DOMContentLoaded', () => {
    const commentsApp = document.getElementById('comments-app');
    
    if (commentsApp) {
        const postId = commentsApp.dataset.postId;
        const commentsContainer = document.getElementById('comments-container');
        const commentForm = document.getElementById('comment-form');
        
        // Fetch and render comments
        const fetchComments = async () => {
            try {
                const res = await fetch(`/api/posts/${postId}/comments`);
                const comments = await res.json();
                renderComments(comments);
            } catch (err) {
                console.error("Error fetching comments:", err);
            }
        };

        const renderComments = (comments) => {
            if (comments.length === 0) {
                commentsContainer.innerHTML = '<p style="color: var(--text-muted); font-style: italic;">No comments yet. Be the first to share your thoughts!</p>';
                return;
            }
            
            commentsContainer.innerHTML = comments.map(comment => `
                <div class="comment" id="comment-${comment.id}">
                    <div class="comment-meta">
                        <strong>${comment.author}</strong>
                        <span>${comment.date_posted}</span>
                    </div>
                    <div class="comment-content mt-2">${comment.content.replace(/\n/g, '<br>')}</div>
                    ${comment.is_author ? `
                        <div class="mt-2 text-right">
                            <button class="btn btn-danger btn-sm" onclick="deleteComment(${comment.id})" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;">Delete</button>
                        </div>
                    ` : ''}
                </div>
            `).join('');
        };

        // Add a new comment
        if (commentForm) {
            commentForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const contentInput = document.getElementById('comment-content');
                const content = contentInput.value.trim();
                if (!content) return;

                try {
                    const res = await fetch(`/api/posts/${postId}/comments`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ content })
                    });
                    
                    if (res.ok) {
                        contentInput.value = '';
                        fetchComments(); // Reload comments
                    } else {
                        alert("Failed to add comment.");
                    }
                } catch (err) {
                    console.error("Error adding comment:", err);
                }
            });
        }
        
        // Initial fetch
        fetchComments();
    }
});

// Global delete comment function
window.deleteComment = async (commentId) => {
    if (!confirm("Are you sure you want to delete this comment?")) return;
    
    try {
        const res = await fetch(`/api/comments/${commentId}`, {
            method: 'DELETE'
        });
        
        if (res.ok) {
            document.getElementById(`comment-${commentId}`).remove();
            
            // Check if there are any comments left
            const commentsContainer = document.getElementById('comments-container');
            if (commentsContainer.children.length === 0) {
                commentsContainer.innerHTML = '<p style="color: var(--text-muted); font-style: italic;">No comments yet. Be the first to share your thoughts!</p>';
            }
        } else {
            alert("Failed to delete comment.");
        }
    } catch (err) {
        console.error("Error deleting comment:", err);
    }
};
