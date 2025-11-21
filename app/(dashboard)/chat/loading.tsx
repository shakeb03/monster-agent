import { Skeleton } from '@/components/ui/skeleton';

export default function ChatLoading() {
  return (
    <div className="flex h-screen w-full">
      {/* Sidebar skeleton */}
      <div className="w-64 border-r border-border p-4">
        <Skeleton className="h-10 w-full mb-4" />
        <div className="space-y-2">
          {[...Array(10)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>

      {/* Main chat area skeleton */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 p-4 space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
              <Skeleton className="h-20 w-2/3" />
            </div>
          ))}
        </div>
        <div className="border-t border-border p-4">
          <Skeleton className="h-12 w-full" />
        </div>
      </div>

      {/* Analysis panel skeleton */}
      <div className="w-80 border-l border-border p-4">
        <Skeleton className="h-8 w-full mb-4" />
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

