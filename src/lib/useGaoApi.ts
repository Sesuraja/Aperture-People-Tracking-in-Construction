import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, limit, orderBy, db } from './db';
import { gaoApi, RealtimeTag, HistoryRecord } from './gaoApi';

export function useGaoRealtime(pollingIntervalMs = 2000) {
  const [tags, setTags] = useState<RealtimeTag[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    const fetchRealtime = async () => {
       try {
          const data = await gaoApi.getTagsInRealtime();
          if (isMounted) {
             setTags(data);
             setIsLoading(false);
             setError(null);
          }
       } catch (err: any) {
          if (isMounted) {
             console.error(err);
             setError(err);
             setIsLoading(false);
          }
       }
    };
    
    fetchRealtime();
    const interval = setInterval(fetchRealtime, pollingIntervalMs);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [pollingIntervalMs]);

  return { tags, error, isLoading };
}

export function useGaoHistory(skip: number, take: number) {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    const fetchHistory = async () => {
      setIsLoading(true);
      try {
        const [data, count] = await Promise.all([
           gaoApi.getHistoryRecords(skip, take),
           gaoApi.getHistoryTotalCount()
        ]);
        if (isMounted) {
          setRecords(data);
          setTotalCount(count);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchHistory();

    return () => {
      isMounted = false;
    };
  }, [skip, take]);

  return { records, totalCount, error, isLoading };
}
