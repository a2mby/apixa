<?php

namespace Database\Seeders;

/** Explicit opt-in; no 100,000-row allocation is made by the normal baseline seed. */
class StressPlaygroundSeeder extends ScalePlaygroundSeeder
{
    protected int $records = 100000;

    protected string $profile = 'stress';
}
