export type ApplicationState = "draft" | "submitted" | "under_review" | "approved" | "rejected" | "needs_information";
export type StoreState = "draft" | "pending_publication" | "published" | "suspended" | "archived";

const applicationTransitions: Record<ApplicationState, readonly ApplicationState[]> = {
  draft: ["submitted"],
  submitted: ["under_review", "rejected", "needs_information"],
  under_review: ["approved", "rejected", "needs_information"],
  approved: [],
  rejected: ["submitted"],
  needs_information: ["submitted", "under_review"],
};

const storeTransitions: Record<StoreState, readonly StoreState[]> = {
  draft: ["pending_publication"],
  pending_publication: ["published", "draft", "suspended"],
  published: ["suspended", "archived"],
  suspended: ["published", "archived"],
  archived: [],
};

export function canTransitionApplication(from: ApplicationState, to: ApplicationState) {
  return applicationTransitions[from].includes(to);
}

export function canTransitionStore(from: StoreState, to: StoreState, vendorApproved: boolean) {
  return storeTransitions[from].includes(to)
    && (to !== "pending_publication" || vendorApproved)
    && (to !== "published" || vendorApproved);
}

