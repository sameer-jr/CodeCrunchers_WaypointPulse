import { BarChart3, CalendarDays, Camera, CheckCircle2, ClipboardList, House, Layers, Package, PlusCircle, RefreshCw, Route, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { Role } from '@waypoint/shared';

export interface WorkspacePage {
  slug: string; label: string; title: string; description: string;
  emptyTitle: string; emptyDescription: string; icon: LucideIcon;
}
export const NAVIGATION: Record<Role, WorkspacePage[]> = {
  DISPATCHER: [
    { slug: 'pulse', label: 'Pulse', title: "Today's Delivery Pulse", description: 'One operational picture of demand, capacity and the plan that connects every role.', emptyTitle: 'Your delivery pulse starts here', emptyDescription: 'Orders, fleet readiness and delivery progress will appear when the operational services are connected.', icon: House },
    { slug: 'orders', label: 'Orders', title: 'Orders', description: 'A shared queue for confirmed demand across the Waypoint network.', emptyTitle: 'No order data connected', emptyDescription: 'Confirmed orders and their filters will be available in a later milestone.', icon: Package },
    { slug: 'planning', label: 'Planning', title: 'Planning Studio', description: 'Build a feasible delivery plan and understand every assignment.', emptyTitle: 'Planning is awaiting its engine', emptyDescription: 'Allocation, constraint checks and plan release are not available in this foundation.', icon: CalendarDays },
    { slug: 'routes', label: 'Routes / Trips', title: 'Routes / Trips', description: 'Vehicle assignments, stop sequences and dispatch readiness in one place.', emptyTitle: 'No trips connected', emptyDescription: 'Released trips will appear here once planning and trip services are implemented.', icon: Route },
    { slug: 'exceptions', label: 'Exceptions', title: 'Exception Centre', description: 'Keep operational issues visible from loading through receipt.', emptyTitle: 'Exception data is not connected', emptyDescription: 'Loading, delivery and receipt issues will be connected in later milestones.', icon: TriangleAlert },
    { slug: 'capacity', label: 'Future Capacity', title: 'Future Capacity', description: 'A reserved workspace for future capacity insights.', emptyTitle: 'No prediction outputs loaded', emptyDescription: 'Future integrations can add verified predictions. No forecasts are generated in this foundation.', icon: BarChart3 }
  ],
  LOADER: [
    { slug: 'loads', label: "Today's Loads", title: "Today's Loads", description: 'A focused workspace for the loading dock and released manifests.', emptyTitle: 'No released loads connected', emptyDescription: 'Trips and loading checklists will appear after the loading workflow is implemented.', icon: ClipboardList },
    { slug: 'load-detail', label: 'Load Detail', title: 'Load Detail', description: 'Vehicle, stop sequence and actual loaded quantities.', emptyTitle: 'A manifest has not been connected', emptyDescription: 'Select a released load here when trip and loading services become available.', icon: Layers },
    { slug: 'exceptions', label: 'Exceptions', title: 'Loading Exceptions', description: 'Record a loading issue and keep dispatch informed.', emptyTitle: 'Loading exceptions are not connected', emptyDescription: 'Shortfall reporting and manifest revisions will be implemented in the loading milestone.', icon: TriangleAlert }
  ],
  DRIVER: [
    { slug: 'today', label: 'Today', title: "Today's Route", description: 'Your route, next stop and delivery progress in one focused workspace.', emptyTitle: 'No assigned route connected', emptyDescription: 'Your assigned trips will appear when the driver workflow is implemented.', icon: House },
    { slug: 'route', label: 'Route', title: 'Route & Stops', description: 'Delivery windows, access notes and the next stop.', emptyTitle: 'No stops connected', emptyDescription: 'Stop details and delivery outcomes are awaiting the route and delivery services.', icon: Route },
    { slug: 'proof', label: 'Proof', title: 'Delivery Proof', description: 'Quantity, recipient and supporting delivery evidence.', emptyTitle: 'Delivery proof is not available yet', emptyDescription: 'Proof capture will be connected alongside delivery completion in a later milestone.', icon: Camera },
    { slug: 'sync', label: 'Offline / Sync', title: 'Offline & Sync', description: 'A clear record of saved updates and synchronization.', emptyTitle: 'Offline capability is not available yet', emptyDescription: 'Route caching and synchronization are planned for the offline milestone. This foundation requires a connection.', icon: RefreshCw }
  ],
  STORE_MANAGER: [
    { slug: 'home', label: 'Home', title: 'Outlet Home', description: 'Your orders and expected deliveries in one connected workspace.', emptyTitle: 'No store orders connected', emptyDescription: 'Upcoming orders and delivery updates will appear when store services are implemented.', icon: House },
    { slug: 'place-order', label: 'Place Order', title: 'Place Order', description: 'Request a delivery for an eligible operating day.', emptyTitle: 'Ordering is not available yet', emptyDescription: 'Order creation and cutoff validation will be implemented in the store milestone.', icon: PlusCircle },
    { slug: 'tracking', label: 'Track Delivery', title: 'Track Delivery', description: 'Follow an order from confirmation to delivery.', emptyTitle: 'Tracking data is not connected', emptyDescription: 'Your order timeline and delivery updates will appear after operational workflows are connected.', icon: Route },
    { slug: 'receipt', label: 'Confirm Receipt', title: 'Confirm Receipt', description: 'Compare expected and delivered quantities before confirming receipt.', emptyTitle: 'No deliveries connected for receipt', emptyDescription: 'Receipt confirmation and discrepancy reporting will be connected in the receipt milestone.', icon: CheckCircle2 }
  ]
};
export const ROLE_SLUG: Record<Role, string> = { DISPATCHER: 'dispatcher', LOADER: 'loader', DRIVER: 'driver', STORE_MANAGER: 'store' };
