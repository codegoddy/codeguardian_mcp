# CommitReviewModal Component

A blocking modal component for reviewing Git commits before they're tracked as time entries.

## Features

- **Blocking Modal**: Cannot be closed until the commit is reviewed (approved or rejected)
- **Commit Details Display**: Shows commit hash, message, author, timestamp
- **Deliverable Selection**: Choose which deliverable the commit belongs to
- **Time Adjustment**: Modify the estimated hours if needed
- **Notes Field**: Add context about non-coding work or meetings
- **Submit/Reject Actions**: Approve to track time or reject the commit

## Usage

### Basic Example

```tsx
import { useState } from 'react';
import { CommitReviewModal } from '@/components/ui';
import { CommitReview } from '@/services/reviews';

function MyComponent() {
  const [review, setReview] = useState<CommitReview | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleReviewSubmitted = () => {
    setIsOpen(false);
    setReview(null);
    // Refresh your data or show a success message
  };

  return (
    <CommitReviewModal
      review={review}
      isOpen={isOpen}
      onReviewSubmitted={handleReviewSubmitted}
    />
  );
}
```

### With NATS Integration

```tsx
import { useState, useEffect } from 'react';
import { CommitReviewModal } from '@/components/ui';
import { CommitReview, reviewsApi } from '@/services/reviews';
import { useNATS } from '@/hooks/useNATS';

function CommitReviewHandler() {
  const [currentReview, setCurrentReview] = useState<CommitReview | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Subscribe to NATS commit review events
  useNATS({
    onCommitReview: async (data) => {
      // Load the pending review
      const reviews = await reviewsApi.getPendingReviews();
      if (reviews.length > 0) {
        setCurrentReview(reviews[0]);
        setIsModalOpen(true);
      }
    },
  });

  const handleReviewSubmitted = () => {
    setIsModalOpen(false);
    setCurrentReview(null);
  };

  return (
    <CommitReviewModal
      review={currentReview}
      isOpen={isModalOpen}
      onReviewSubmitted={handleReviewSubmitted}
    />
  );
}
```

### Loading Pending Reviews on Mount

```tsx
import { useState, useEffect } from 'react';
import { CommitReviewModal } from '@/components/ui';
import { CommitReview, reviewsApi } from '@/services/reviews';

function Dashboard() {
  const [pendingReviews, setPendingReviews] = useState<CommitReview[]>([]);
  const [currentReview, setCurrentReview] = useState<CommitReview | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    loadPendingReviews();
  }, []);

  const loadPendingReviews = async () => {
    const reviews = await reviewsApi.getPendingReviews();
    setPendingReviews(reviews);
    
    // Show first review if any exist
    if (reviews.length > 0) {
      setCurrentReview(reviews[0]);
      setIsModalOpen(true);
    }
  };

  const handleReviewSubmitted = () => {
    // Remove current review and show next one
    const remaining = pendingReviews.filter(r => r.id !== currentReview?.id);
    setPendingReviews(remaining);
    
    if (remaining.length > 0) {
      setCurrentReview(remaining[0]);
    } else {
      setIsModalOpen(false);
      setCurrentReview(null);
    }
  };

  return (
    <div>
      {/* Your dashboard content */}
      
      <CommitReviewModal
        review={currentReview}
        isOpen={isModalOpen}
        onReviewSubmitted={handleReviewSubmitted}
      />
    </div>
  );
}
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `review` | `CommitReview \| null` | Yes | The commit review to display |
| `isOpen` | `boolean` | Yes | Controls modal visibility |
| `onClose` | `() => void` | No | Optional close handler (for testing/dev) |
| `onReviewSubmitted` | `() => void` | Yes | Called when review is submitted or rejected |

## CommitReview Type

```typescript
interface CommitReview {
  id: number;
  project_id: number;
  commit_hash: string;
  commit_message: string;
  commit_author: string | null;
  commit_timestamp: string | null;
  deliverable_id: number | null;
  parsed_hours: number | null;
  manual_hours: number | null;
  manual_notes: string | null;
  status: string;
  reviewed_by: number | null;
  reviewed_at: string | null;
  created_at: string;
}
```

## Behavior

### Blocking Modal
By default, the modal cannot be closed by clicking outside or pressing ESC. This ensures commits are reviewed before continuing work. For development/testing, you can provide an `onClose` prop to allow closing.

### Form Validation
- **Deliverable**: Required - must select a deliverable
- **Hours**: Optional - defaults to parsed hours from commit
- **Notes**: Optional - for additional context

### Actions
- **Approve & Track Time**: Creates a time entry and marks review as complete
- **Reject Commit**: Marks the review as rejected without creating a time entry

## Styling

The modal uses the application's design system with:
- Brutalist borders and shadows
- Email-inspired button styles
- Responsive layout
- Accessible form controls

## API Integration

The component uses the `reviewsApi` service which provides:
- `getPendingReviews()` - Get all pending reviews
- `submitReview(id, data)` - Approve a review
- `rejectReview(id, data)` - Reject a review

## Related Components

- `useNATS` hook - For real-time commit notifications
- `reviewsApi` service - For API calls
- `deliverablesApi` service - For loading deliverables

## Notes

- The modal automatically loads deliverables for the commit's project
- Only active deliverables (in_progress or pending) are shown
- Time adjustments are tracked separately from parsed hours
- All form data is validated before submission
