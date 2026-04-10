

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://khqjesozgubpgwzxtwdg.supabase.co'
const supabaseAnonKey = 'sb_publishable_NeS9LVoaioJaHD9u6b4kwA_07eDCQSA'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)