import { useState } from 'react';
import type { ContentType } from '@atheleos/shared';
import { ContentBrowser } from './Content';

export default function Stories() {
  const [type, setType] = useState<ContentType>('story');
  return (
    <div>
      <div className="page" style={{ paddingBottom: 0 }}>
        <div className="tabs" role="tablist" style={{ marginBottom: 0 }}>
          <button role="tab" aria-selected={type === 'story'} className={type === 'story' ? 'active' : ''} onClick={() => setType('story')}>Stories</button>
          <button role="tab" aria-selected={type === 'clip'} className={type === 'clip' ? 'active' : ''} onClick={() => setType('clip')}>Reels (clips)</button>
        </div>
      </div>
      <ContentBrowser
        key={type}
        types={[type]}
        heading={type === 'story' ? 'Stories' : 'Reels'}
        subheading={type === 'story'
          ? 'Stories expire 24 hours after publication — the countdown follows the app’s retention rules. Expired stories are kept visible here for moderation history.'
          : 'Clips are the app’s reels. Previews, engagement and moderation use the same content endpoints as posts.'}
      />
    </div>
  );
}
