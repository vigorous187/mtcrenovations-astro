export interface ReviewItem {
  name: string;
  profilePhoto: string | null;
  googleProfileUrl: string | null;
  googleReviewUrl: string | null;
  rating: number;
  text: string;
  relativeTime: string;
  publishTime: string;
}

export interface ReviewsBuildArtifact {
  aggregate: { rating: number; count: number };
  reviews: ReviewItem[];
  fetched_at: string;
  googleReviewsUrl?: string;
}
